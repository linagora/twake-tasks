import { asc, sql as raw } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import type { OutgoingEvent } from '../../events/envelope.ts'
import { outbox } from '../../events/schema.ts'
import { createDb } from '../../infra/db.ts'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

interface Section {
  id: string
  category: string
}

async function aBoardOf(owner: TestUser) {
  return (
    await api.as(owner).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<{ id: string; project: { id: string }; sections: Section[] }>()
}

async function aTaskOn(
  owner: TestUser,
  boardId: string,
  sectionId: string | null
) {
  const task = (
    await api
      .as(owner)
      .post(`/boards/${boardId}/tasks`, { sectionId, title: 'Logo' })
  ).json<{ id: string }>()
  return { id: task.id, path: `/boards/${boardId}/tasks/${task.id}` }
}

async function eventsOf(taskId: string) {
  return db
    .select({ event: outbox.event })
    .from(outbox)
    .where(raw`${outbox.event} -> 'data' -> 'object' ->> 'id' = ${taskId}`)
    .orderBy(asc(outbox.id))
    .then(rows => rows.map(row => ({ event: row.event as OutgoingEvent })))
}

const actions = (events: { event: OutgoingEvent }[]) =>
  events.map(({ event }) => event.type.split('.').at(-2))

describe('task events', () => {
  it('publishes each change to a task, in its project', async () => {
    const alice = aUser()
    const board = await aBoardOf(alice)
    const [todo, doing] = board.sections
    const done = board.sections.find(({ category }) => category === 'completed')
    const task = await aTaskOn(alice, board.id, todo?.id ?? '')

    await api.as(alice).patch(task.path, { title: 'New logo', priority: 2 })
    await api.as(alice).post(`${task.path}/move`, { sectionId: doing?.id })
    await api.as(alice).post(`${task.path}/move`, { sectionId: done?.id })
    await api.as(alice).post(`${task.path}/move`, { sectionId: doing?.id })
    await api
      .as(alice)
      .put(`${task.path}/assignees`, { userIds: [alice.userId] })
    await api.as(alice).put(`${task.path}/assignees`, { userIds: [] })
    await api.as(alice).delete(task.path)
    await api.as(alice).post(`${task.path}/restore`, {})

    const events = await eventsOf(task.id)
    expect(actions(events)).toEqual([
      'created',
      'updated',
      'updated',
      'moved',
      'moved',
      'completed',
      'moved',
      'reopened',
      'assigned',
      'unassigned',
      'deleted',
      'restored'
    ])
    for (const { event } of events) {
      expect(event.data).toMatchObject({
        object: { container: { kind: 'project', id: board.project.id } }
      })
    }
    expect(events[0]?.event).toMatchObject({
      specversion: '1.0',
      source: 'twake://tasks',
      type: 'com.twake.tasks.task.created.v1',
      twakeorg: alice.organizationId,
      twakeactorid: alice.userId,
      twakeactor: alice.email
    })
    expect(events[0]?.event.data).toEqual({
      object: {
        type: 'task',
        id: task.id,
        key: 'DES-1',
        title: 'Logo',
        board: { id: board.id, name: 'Design' },
        container: { kind: 'project', id: board.project.id }
      }
    })
    expect(events[1]?.event.data).toMatchObject({
      changes: { title: { from: 'Logo', to: 'New logo' } }
    })
    expect(events[3]?.event.data).toMatchObject({
      changes: { section: { from: todo?.id, to: doing?.id } }
    })
    expect(events[8]?.event.data).toMatchObject({
      assignee: { id: alice.userId }
    })
    expect(new Set(events.map(({ event }) => event.id)).size).toBe(12)
  })

  it('publishes a completed recurring task as completed, then its new due date', async () => {
    const alice = aUser()
    const board = await aBoardOf(alice)
    const task = await aTaskOn(alice, board.id, null)
    await api.as(alice).patch(task.path, {
      dueDate: '2099-01-31',
      recurrence: { every: 1, unit: 'months', fromCompletion: false }
    })

    await api.as(alice).post(`${task.path}/complete`, { state: 'completed' })

    const events = await eventsOf(task.id)
    expect(actions(events).slice(-2)).toEqual(['completed', 'updated'])
    expect(events.at(-1)?.event.data).toMatchObject({
      changes: { dueDate: { to: '2099-02-28' } }
    })
  })

  it('names the project that holds the task', async () => {
    const admin = aUser()
    const board = await aBoardOf(admin)

    const task = await aTaskOn(admin, board.id, null)

    const [first] = await eventsOf(task.id)
    expect(first?.event.data).toMatchObject({
      object: { container: { kind: 'project', id: board.project.id } }
    })
  })
})
