import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { aUser, joinBoard, startApp, type TestUser } from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

interface Task {
  id: string
  key: string
  sectionId: string | null
  dueDate: string | null
  dueTime: string | null
  completedAt: string | null
  assignees: { userId: string }[]
  labels: { id: string }[]
}

interface Board {
  id: string
  sections: { id: string; name: string; category: string }[]
  tasks: Task[]
}

async function aBoardWithTasks(owner: TestUser, count = 3, keyPrefix = 'DES') {
  const board = (
    await api.as(owner).post('/boards', { name: 'Design', keyPrefix })
  ).json<Board>()
  const ids: string[] = []
  for (let index = 0; index < count; index++) {
    const task = (
      await api.as(owner).post(`/boards/${board.id}/tasks`, {
        sectionId: board.sections[0]?.id,
        title: `Task ${String(index + 1)}`
      })
    ).json<{ id: string }>()
    ids.push(task.id)
  }
  return { board, ids }
}

const bulk = (
  user: TestUser,
  boardId: string,
  taskIds: string[],
  action: object
) => api.as(user).post(`/boards/${boardId}/tasks/bulk`, { taskIds, action })

const tasksOf = async (user: TestUser, boardId: string) =>
  (await api.as(user).get(`/boards/${boardId}`)).json<Board>().tasks

describe('changing tasks in bulk', () => {
  it('moves them all, completing them in a completed section', async () => {
    const alice = aUser()
    const { board, ids } = await aBoardWithTasks(alice)
    const done = board.sections.find(each => each.category === 'completed')

    const response = await bulk(alice, board.id, ids, {
      kind: 'move',
      sectionId: done?.id
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ failed: [] })
    const moved = await tasksOf(alice, board.id)
    expect(moved.map(task => task.sectionId)).toEqual(ids.map(() => done?.id))
    expect(moved.every(task => task.completedAt !== null)).toBe(true)
  })

  it('adds an assignee without removing the others, then removes them', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const { board, ids } = await aBoardWithTasks(alice)
    await joinBoard(db, alice, board.id, bob, 'editor')
    const [first = ''] = ids
    await api.as(alice).put(`/boards/${board.id}/tasks/${first}/assignees`, {
      userIds: [alice.userId]
    })

    await bulk(alice, board.id, ids, {
      kind: 'assign',
      userId: bob.userId,
      assigned: true
    })
    const assigned = await tasksOf(alice, board.id)
    const notified = (await api.as(bob).get('/notifications')).json<{
      notifications: { reason: string }[]
    }>().notifications
    await bulk(alice, board.id, ids, {
      kind: 'assign',
      userId: bob.userId,
      assigned: false
    })

    expect(
      assigned.map(task => task.assignees.map(each => each.userId).sort())
    ).toEqual([[alice.userId, bob.userId].sort(), [bob.userId], [bob.userId]])
    expect(notified.filter(each => each.reason === 'assigned')).toHaveLength(3)
    expect(
      (await tasksOf(alice, board.id)).map(task =>
        task.assignees.map(each => each.userId)
      )
    ).toEqual([[alice.userId], [], []])
  })

  it('removes a label only where it is, and refuses one off the project', async () => {
    const alice = aUser()
    const { board, ids } = await aBoardWithTasks(alice)
    const urgent = (
      await api.as(alice).post(`/boards/${board.id}/labels`, { name: 'Urgent' })
    ).json<{ id: string }>()
    const brand = (
      await api.as(alice).post(`/boards/${board.id}/labels`, { name: 'Brand' })
    ).json<{ id: string }>()
    const [first = '', second = ''] = ids
    await api.as(alice).put(`/boards/${board.id}/tasks/${first}/labels`, {
      labelIds: [urgent.id, brand.id]
    })
    await api.as(alice).put(`/boards/${board.id}/tasks/${second}/labels`, {
      labelIds: [brand.id]
    })

    const removed = await bulk(alice, board.id, ids, {
      kind: 'label',
      labelId: urgent.id,
      labeled: false
    })
    const foreign = await bulk(alice, board.id, ids, {
      kind: 'label',
      labelId: crypto.randomUUID(),
      labeled: true
    })

    expect(removed.json()).toEqual({ failed: [] })
    expect(
      (await tasksOf(alice, board.id)).map(task =>
        task.labels.map(each => each.id)
      )
    ).toEqual([[brand.id], [brand.id], []])
    expect(foreign.statusCode).toBe(400)
    expect(foreign.json()).toEqual({ error: 'invalid_label' })
  })

  it('sets the due date and keeps each task its time', async () => {
    const alice = aUser()
    const { board, ids } = await aBoardWithTasks(alice, 2)
    const [first = ''] = ids
    await api.as(alice).patch(`/boards/${board.id}/tasks/${first}`, {
      dueDate: '2026-11-01',
      dueTime: '09:30'
    })

    await bulk(alice, board.id, ids, {
      kind: 'edit',
      changes: { dueDate: '2026-11-20' }
    })

    expect(
      (await tasksOf(alice, board.id)).map(({ dueDate, dueTime }) => ({
        dueDate,
        dueTime
      }))
    ).toEqual([
      { dueDate: '2026-11-20', dueTime: '09:30' },
      { dueDate: '2026-11-20', dueTime: null }
    ])
  })

  it('changes the others when one task is gone, and names it', async () => {
    const alice = aUser()
    const { board, ids } = await aBoardWithTasks(alice)
    const [first = '', ...rest] = ids
    await api.as(alice).delete(`/boards/${board.id}/tasks/${first}`)

    const response = await bulk(alice, board.id, ids, {
      kind: 'edit',
      changes: { priority: 1 }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ failed: [first] })
    const shown = await tasksOf(alice, board.id)
    expect(shown.map(task => task.id)).toEqual(rest)
  })

  it('trashes them, then restores them', async () => {
    const alice = aUser()
    const { board, ids } = await aBoardWithTasks(alice)

    await bulk(alice, board.id, ids, { kind: 'trash' })
    const trashed = await tasksOf(alice, board.id)
    await bulk(alice, board.id, ids, { kind: 'restore' })

    expect(trashed).toEqual([])
    expect((await tasksOf(alice, board.id)).map(task => task.id)).toEqual(ids)
  })

  it('logs the change in the history of each task, by its author', async () => {
    const alice = aUser()
    const { board, ids } = await aBoardWithTasks(alice, 2)

    await bulk(alice, board.id, ids, { kind: 'edit', changes: { priority: 2 } })

    for (const taskId of ids) {
      const entries = (
        await api.as(alice).get(`/boards/${board.id}/tasks/${taskId}/history`)
      ).json<{
        entries: { field: string; to: unknown; actor: { userId: string } }[]
      }>().entries
      expect(entries[0]).toMatchObject({
        field: 'priority',
        to: 2,
        actor: { userId: alice.userId }
      })
    }
  })

  it('moves them to another board, where they take its keys', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const { board, ids } = await aBoardWithTasks(alice, 2)
    await joinBoard(db, alice, board.id, bob, 'editor')
    const target = (
      await api.as(alice).post('/boards', { name: 'Ops', keyPrefix: 'OPS' })
    ).json<Board>()
    for (const taskId of ids) {
      await api.as(alice).put(`/boards/${board.id}/tasks/${taskId}/assignees`, {
        userIds: [bob.userId]
      })
    }
    const to = { boardId: target.id, sectionId: target.sections[0]?.id }

    const preview = await api
      .as(alice)
      .post(`/boards/${board.id}/tasks/bulk/transfer/preview`, {
        taskIds: ids,
        to
      })
    const moved = await bulk(alice, board.id, ids, { kind: 'transfer', to })

    expect(preview.json()).toEqual({
      droppedAssignees: [{ userId: bob.userId, name: null, email: bob.email }],
      createdLabels: []
    })
    expect(moved.json()).toEqual({ failed: [] })
    expect(await tasksOf(alice, board.id)).toEqual([])
    expect(
      (await tasksOf(alice, target.id)).map(task => task.key).sort()
    ).toEqual(['OPS-1', 'OPS-2'])
  })

  it('is for editors only, and up to 200 tasks', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const { board, ids } = await aBoardWithTasks(alice, 1)
    await joinBoard(db, alice, board.id, bob, 'viewer')

    const byViewer = await bulk(bob, board.id, ids, { kind: 'archive' })
    const tooMany = await bulk(
      alice,
      board.id,
      Array.from({ length: 201 }, () => crypto.randomUUID()),
      { kind: 'archive' }
    )

    expect(byViewer.statusCode).toBe(403)
    expect(tooMany.statusCode).toBe(400)
    expect((await tasksOf(alice, board.id)).map(task => task.id)).toEqual(ids)
  })
})
