import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb, inTenant } from '../../infra/db.ts'
import { createScheduler } from '../../scheduler/scheduler.ts'
import { aUser, startApp } from '../../testing/app.ts'
import {
  emailNotification,
  NOTIFICATION_EMAIL_JOB,
  type Mail
} from './notificationEmails.ts'
import { boardMembers } from './schema.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

function aMailbox() {
  const sent: Mail[] = []
  const scheduler = createScheduler({
    db,
    logger: pino({ level: 'silent' }),
    handlers: {
      [NOTIFICATION_EMAIL_JOB]: emailNotification({
        appUrl: 'https://tasks.example.com/',
        send: mail => {
          sent.push(mail)
          return Promise.resolve()
        }
      })
    }
  })
  return { sent, deliver: () => scheduler.runDue() }
}

describe('notification emails', () => {
  it('emails a follower the change, with a link to the task', async () => {
    const alice = aUser({ email: 'alice@example.com' })
    const bob = aUser({
      organizationId: alice.organizationId,
      email: 'bob@example.com'
    })
    const board = (
      await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
    ).json<{ id: string }>()
    await inTenant(db, alice, tx =>
      tx.insert(boardMembers).values({
        boardId: board.id,
        organizationId: alice.organizationId,
        userId: bob.userId,
        email: bob.email,
        role: 'editor'
      })
    )
    const task = (
      await api
        .as(alice)
        .post(`/boards/${board.id}/tasks`, { sectionId: null, title: 'Logo' })
    ).json<{ id: string; key: string }>()
    const mailbox = aMailbox()

    await api.as(alice).put(`/boards/${board.id}/tasks/${task.id}/assignees`, {
      userIds: [bob.userId]
    })
    await mailbox.deliver()

    const sent = mailbox.sent.filter(mail => mail.text.includes(board.id))
    expect(sent).toEqual([
      {
        to: 'bob@example.com',
        subject: `${task.key} Logo`,
        text: expect.stringContaining(
          `https://tasks.example.com/boards/${board.id}?task=${task.key}`
        ) as string
      }
    ])
    expect(sent[0]?.text).toContain('You were assigned')
  })
})
