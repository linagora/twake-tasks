import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { processedEvents } from './events/schema.ts'
import { createDb, inTenant } from './infra/db.ts'
import { notifications } from './modules/boards/schema.ts'
import { RETENTION_JOB, retention } from './retention.ts'
import { plan, unschedule } from './scheduler/scheduler.ts'
import { jobs } from './scheduler/schema.ts'
import { aB2cUser, aUser, startApp, type TestUser } from './testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await unschedule(db, RETENTION_JOB)
  await api.close()
  await sql.end()
})

const DAY_MS = 24 * 60 * 60 * 1000
const now = new Date()
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS)

const run = () =>
  db.transaction(tx =>
    retention(
      { processedEventsDays: 30, readNotificationsDays: 180 },
      () => now
    )({}, tx)
  )

async function notified(user: TestUser, readAt: (Date | null)[]) {
  const board = (
    await api.as(user).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<{ id: string }>()
  const task = (
    await api
      .as(user)
      .post(`/boards/${board.id}/tasks`, { sectionId: null, title: 'Logo' })
  ).json<{ id: string }>()
  return inTenant(db, user, async tx => {
    const rows = await tx
      .insert(notifications)
      .values(
        readAt.map((at, index) => ({
          taskId: task.id,
          organizationId: user.organizationId,
          userId: user.userId,
          reason: `reason-${String(index)}`,
          createdAt: daysAgo(400),
          readAt: at
        }))
      )
      .returning({ id: notifications.id })
    return rows.map(row => row.id)
  })
}

const notificationsLeft = (user: TestUser, ids: string[]) =>
  inTenant(db, user, async tx =>
    (
      await tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(inArray(notifications.id, ids))
    )
      .map(row => row.id)
      .sort()
  )

describe('the retention job', () => {
  it('forgets processed events after 30 days', async () => {
    const [old, recent] = [randomUUID(), randomUUID()]
    await db.insert(processedEvents).values([
      {
        consumer: 'retention-test',
        source: 'space',
        id: old,
        processedAt: daysAgo(31)
      },
      {
        consumer: 'retention-test',
        source: 'space',
        id: recent,
        processedAt: daysAgo(29)
      }
    ])

    await run()

    const left = await db
      .select({ id: processedEvents.id })
      .from(processedEvents)
      .where(inArray(processedEvents.id, [old, recent]))
    expect(left.map(row => row.id)).toEqual([recent])
  })

  it('forgets notifications read more than 180 days ago, in every tenant', async () => {
    const member = aUser()
    const b2c = aB2cUser()
    const [memberOld, memberRecent, memberUnread] = await notified(member, [
      daysAgo(181),
      daysAgo(179),
      null
    ])
    const [b2cOld] = await notified(b2c, [daysAgo(181)])
    if (!memberOld || !memberRecent || !memberUnread || !b2cOld) {
      throw new Error('no notifications')
    }

    await run()

    expect(
      await notificationsLeft(member, [memberOld, memberRecent, memberUnread])
    ).toEqual([memberRecent, memberUnread].sort())
    expect(await notificationsLeft(b2c, [b2cOld])).toEqual([])
  })

  it('runs at once when first planned, then again a day later', async () => {
    const runAt = async () =>
      (
        await db
          .select({ runAt: jobs.runAt })
          .from(jobs)
          .where(eq(jobs.key, RETENTION_JOB))
      ).map(job => job.runAt)
    await unschedule(db, RETENTION_JOB)

    await plan(db, RETENTION_JOB)
    const [planned] = await runAt()
    expect(planned?.getTime()).toBeLessThanOrEqual(Date.now())

    await run()
    expect(await runAt()).toEqual([new Date(now.getTime() + DAY_MS)])
  })
})
