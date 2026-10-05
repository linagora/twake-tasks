import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb, inTenant } from '../../infra/db.ts'
import { createScheduler } from '../../scheduler/scheduler.ts'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'
import { REMINDER_JOB, deliverReminder } from './reminderJobs.ts'
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

interface Reminder {
  id: string
  at: string | null
  beforeMinutes: number | null
  firesAt: string | null
}

async function aTaskOf(owner: TestUser) {
  const board = (
    await api.as(owner).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<{ id: string; sections: { id: string }[] }>()
  const task = (
    await api.as(owner).post(`/boards/${board.id}/tasks`, {
      sectionId: board.sections[0]?.id,
      title: 'Logo'
    })
  ).json<{ id: string }>()
  const path = `/boards/${board.id}/tasks/${task.id}`
  return {
    boardId: board.id,
    taskId: task.id,
    edit: (body: object) => api.as(owner).patch(path, body),
    remind: (user: TestUser, body: object) =>
      api.as(user).post(`${path}/reminders`, body),
    reminders: async (user: TestUser) =>
      (await api.as(user).get(`${path}/reminders`)).json<{
        reminders: Reminder[]
      }>().reminders
  }
}

// A clock far ahead runs every reminder scheduled so far.
const later = createScheduler({
  db,
  logger: pino({ level: 'silent' }),
  handlers: { [REMINDER_JOB]: deliverReminder },
  now: () => new Date('2100-01-01T00:00:00Z')
})

describe('reminders', () => {
  it('fires a relative reminder before the due time, in its zone', async () => {
    const owner = aUser()
    const { edit, remind, reminders } = await aTaskOf(owner)
    await edit({
      dueDate: '2099-03-10',
      dueTime: '09:30',
      dueZone: 'Europe/Paris'
    })

    expect(
      (await remind(owner, { beforeMinutes: 30, zone: 'America/New_York' }))
        .statusCode
    ).toBe(201)
    expect(await reminders(owner)).toMatchObject([
      { beforeMinutes: 30, firesAt: '2099-03-10T08:00:00.000Z' }
    ])

    await edit({ dueDate: '2099-03-11' })
    expect(await reminders(owner)).toMatchObject([
      { firesAt: '2099-03-11T08:00:00.000Z' }
    ])
  })

  it('uses its own zone, at nine, when the due date has no time', async () => {
    const owner = aUser()
    const { edit, remind, reminders } = await aTaskOf(owner)
    await edit({ dueDate: '2099-07-01' })

    await remind(owner, { beforeMinutes: 60, zone: 'Asia/Ho_Chi_Minh' })

    expect(await reminders(owner)).toMatchObject([
      { firesAt: '2099-07-01T01:00:00.000Z' }
    ])
  })

  it('keeps reminders to the person who set them', async () => {
    const owner = aUser()
    const colleague = aUser({ organizationId: owner.organizationId })
    const { boardId, remind, reminders } = await aTaskOf(owner)
    await inTenant(db, owner, tx =>
      tx.insert(boardMembers).values({
        boardId,
        organizationId: owner.organizationId,
        userId: colleague.userId,
        email: colleague.email,
        role: 'viewer'
      })
    )

    expect(
      (await remind(colleague, { at: '2099-01-01T10:00:00Z' })).statusCode
    ).toBe(201)

    expect(await reminders(owner)).toEqual([])
    expect(await reminders(colleague)).toMatchObject([
      { at: '2099-01-01T10:00:00.000Z', firesAt: '2099-01-01T10:00:00.000Z' }
    ])
  })

  it('refuses a reminder in the past, or relative to no due date', async () => {
    const owner = aUser()
    const { remind } = await aTaskOf(owner)

    expect(
      (await remind(owner, { at: '2000-01-01T10:00:00Z' })).json()
    ).toEqual({ error: 'invalid_reminder' })
    expect(
      (await remind(owner, { beforeMinutes: 10, zone: 'UTC' })).json()
    ).toEqual({ error: 'invalid_reminder' })
  })

  it('notifies its person when it fires', async () => {
    const owner = aUser()
    const { taskId, remind } = await aTaskOf(owner)
    await remind(owner, { at: '2099-05-01T10:00:00Z' })

    await later.runDue()

    expect(
      (await api.as(owner).get('/notifications')).json<{
        notifications: unknown[]
      }>().notifications
    ).toMatchObject([{ reason: 'reminder', taskId, title: 'Logo' }])
  })

  it('deletes a reminder, and it no longer fires', async () => {
    const owner = aUser()
    const { boardId, taskId, remind, reminders } = await aTaskOf(owner)
    const { id } = (await remind(owner, { at: '2099-05-01T10:00:00Z' })).json<{
      id: string
    }>()

    expect(
      (
        await api
          .as(owner)
          .delete(`/boards/${boardId}/tasks/${taskId}/reminders/${id}`)
      ).statusCode
    ).toBe(204)
    await later.runDue()

    expect(await reminders(owner)).toEqual([])
    expect(
      (await api.as(owner).get('/notifications')).json<{
        notifications: unknown[]
      }>().notifications
    ).toEqual([])
  })
})
