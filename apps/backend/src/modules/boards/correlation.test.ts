import { randomUUID } from 'node:crypto'
import { and, eq, sql as raw } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { strictPublishedEvent } from '../../events/published.ts'
import { outbox } from '../../events/schema.ts'
import { createDb } from '../../infra/db.ts'
import { jobs } from '../../scheduler/schema.ts'
import { aUser, joinBoard, startApp } from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

async function anAssignment(headers: Record<string, string> = {}) {
  const alice = aUser()
  const bob = aUser({ organizationId: alice.organizationId })
  const board = (
    await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<{ id: string }>()
  await joinBoard(db, alice, board.id, bob, 'editor')
  const task = (
    await api
      .as(alice)
      .post(`/boards/${board.id}/tasks`, { sectionId: null, title: 'Logo' })
  ).json<{ id: string }>()

  const response = await api.inject({
    method: 'PUT',
    url: `/api/boards/${board.id}/tasks/${task.id}/assignees`,
    headers: { authorization: `Bearer ${api.tokenOf(alice)}`, ...headers },
    payload: { userIds: [bob.userId] }
  })

  const [assigned] = await db
    .select({ event: outbox.event })
    .from(outbox)
    .where(
      and(
        raw`${outbox.event} -> 'data' -> 'object' ->> 'id' = ${task.id}`,
        raw`${outbox.event} ->> 'type' = 'com.twake.tasks.task.assigned.v1'`
      )
    )
  const [email] = await db
    .select({ requestId: jobs.requestId })
    .from(jobs)
    .where(and(eq(jobs.taskId, task.id), eq(jobs.kind, 'notification_email')))
  return {
    requestId: response.headers['x-request-id'],
    event: strictPublishedEvent.parse(assigned?.event),
    email
  }
}

describe('the correlation id', () => {
  it('follows a change from its request to its event and the email it causes', async () => {
    const requestId = randomUUID()

    const change = await anAssignment({ 'x-request-id': requestId })

    expect(change.requestId).toBe(requestId)
    expect(change.event.twakecorrelationid).toBe(requestId)
    expect(change.email).toEqual({ requestId })
  })

  it('is made up for a request that sends none, or not a uuid', async () => {
    const sent: Record<string, string>[] = [{}, { 'x-request-id': 'select 1' }]
    for (const headers of sent) {
      const change = await anAssignment(headers)

      expect(change.requestId).toMatch(/^[0-9a-f-]{36}$/)
      expect(change.requestId).not.toBe(headers['x-request-id'])
      expect(change.event.twakecorrelationid).toBe(change.requestId)
      expect(change.email).toEqual({ requestId: change.requestId })
    }
  })
})
