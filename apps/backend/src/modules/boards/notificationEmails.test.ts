import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { createScheduler } from '../../scheduler/scheduler.ts'
import { aUser, joinBoard, startApp } from '../../testing/app.ts'
import {
  emailNotification,
  NOTIFICATION_EMAIL_JOB,
  type Mail
} from './notificationEmails.ts'

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
  // The job queue is shared with the other test files, which may have filled
  // it with more than one batch: deliver until nothing is due
  const deliver = async (): Promise<void> => {
    for (let batch = 0; batch < 20; batch++) {
      if ((await scheduler.runDue()) === 0) return
    }
    throw new Error('The job queue was not drained after 20 batches')
  }
  return { sent, deliver }
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
    await joinBoard(db, alice, board.id, bob, 'editor')
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

  it('sends nothing to someone the task left behind when it moved boards', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const design = (
      await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
    ).json<{ id: string }>()
    const ops = (
      await api.as(alice).post('/boards', { name: 'Ops', keyPrefix: 'OPS' })
    ).json<{ id: string }>()
    await joinBoard(db, alice, design.id, bob, 'editor')
    const task = (
      await api
        .as(alice)
        .post(`/boards/${design.id}/tasks`, { sectionId: null, title: 'Logo' })
    ).json<{ id: string }>()
    const mailbox = aMailbox()
    await api.as(alice).put(`/boards/${design.id}/tasks/${task.id}/assignees`, {
      userIds: [bob.userId]
    })

    await api.as(alice).post(`/boards/${design.id}/tasks/${task.id}/transfer`, {
      boardId: ops.id,
      sectionId: null
    })
    await api.as(alice).patch(`/boards/${ops.id}/tasks/${task.id}`, {
      title: 'New logo'
    })
    await mailbox.deliver()

    expect(mailbox.sent.filter(mail => mail.to === bob.email)).toEqual([])
  })
})
