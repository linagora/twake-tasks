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
  title: string
  sectionId: string | null
  parentId: string | null
  priority: number | null
  dueDate: string | null
  dueTime: string | null
  deadline: string | null
  completedAt: string | null
  commentCount: number
  labels: { name: string }[]
  assignees: { userId: string }[]
}

interface Board {
  id: string
  sections: { id: string; name: string }[]
  tasks: Task[]
}

async function aBoard(owner: TestUser) {
  const board = (
    await api.as(owner).post('/boards', { name: 'Launch', keyPrefix: 'LCH' })
  ).json<Board>()
  const path = `/boards/${board.id}`
  const [todo] = board.sections
  if (!todo) throw new Error('missing default sections')
  const add = async (input: object) =>
    (await api.as(owner).post(`${path}/tasks`, input)).json<{ id: string }>().id
  const load = async (user = owner) =>
    (await api.as(user).get(path)).json<Board>()
  return { board, path, todo, add, load }
}

describe('duplicating a task', () => {
  it('copies the task right after the original, with its fields and open sub-tasks', async () => {
    const owner = aUser()
    const bob = aUser({ organizationId: owner.organizationId })
    const { board, path, todo, add, load } = await aBoard(owner)
    await joinBoard(db, owner, board.id, bob, 'editor')
    const brief = await add({ sectionId: todo.id, title: 'Brief' })
    await add({ sectionId: todo.id, title: 'Visuals' })
    const label = (
      await api.as(owner).post(`${path}/labels`, { name: 'Press' })
    ).json<{ id: string }>()
    await api.as(owner).patch(`${path}/tasks/${brief}`, {
      priority: 2,
      dueDate: '2026-12-01',
      dueTime: '09:30',
      deadline: '2026-12-03'
    })
    await api
      .as(owner)
      .put(`${path}/tasks/${brief}/labels`, { labelIds: [label.id] })
    await api
      .as(owner)
      .put(`${path}/tasks/${brief}/assignees`, { userIds: [bob.userId] })
    await api.as(owner).put(`${path}/tasks/${brief}/description`, {
      markdown: 'Plan the launch',
      version: 0
    })
    await api.as(owner).post(`${path}/tasks/${brief}/comments`, { body: 'Hi' })
    const draft = await add({ parentId: brief, title: 'Draft' })
    await api
      .as(owner)
      .post(`${path}/tasks/${draft}/complete`, { state: 'completed' })
    await add({ parentId: draft, title: 'Outline' })
    const dropped = await add({ parentId: brief, title: 'Dropped' })
    await api
      .as(owner)
      .post(`${path}/tasks/${dropped}/complete`, { state: 'canceled' })

    const response = await api
      .as(bob)
      .post(`${path}/tasks/${brief}/duplicate`, { title: 'Copy of Brief' })

    expect(response.statusCode).toBe(201)
    const created = response.json<{ id: string; key: string }>()
    expect(created.key).toBe('LCH-6')
    const after = await load()
    const copy = after.tasks.find(task => task.id === created.id)
    expect(copy).toMatchObject({
      title: 'Copy of Brief',
      sectionId: todo.id,
      parentId: null,
      priority: 2,
      dueDate: '2026-12-01',
      dueTime: '09:30',
      deadline: '2026-12-03',
      completedAt: null,
      commentCount: 0,
      labels: [{ name: 'Press' }],
      assignees: [{ userId: bob.userId }]
    })
    expect(
      after.tasks
        .filter(task => task.sectionId === todo.id)
        .map(task => task.title)
    ).toEqual(['Brief', 'Copy of Brief', 'Visuals'])
    const childOf = (parentId: string | undefined) =>
      after.tasks.filter(task => task.parentId === parentId)
    const [draftCopy, ...others] = childOf(copy?.id)
    expect(others).toEqual([])
    expect(draftCopy).toMatchObject({ title: 'Draft', completedAt: null })
    expect(childOf(draftCopy?.id).map(task => task.title)).toEqual(['Outline'])
    expect(
      (
        await api.as(owner).get(`${path}/tasks/${created.id}/description`)
      ).json()
    ).toMatchObject({ markdown: 'Plan the launch' })
    const history = (
      await api.as(owner).get(`${path}/tasks/${created.id}/history`)
    ).json<{ entries: { field: string; from: unknown }[] }>().entries
    expect(history).toContainEqual(
      expect.objectContaining({ field: 'created', from: 'LCH-1' })
    )
    expect(history.filter(entry => entry.field === 'comment')).toEqual([])
  })

  it('copies a sub-task under the same parent', async () => {
    const owner = aUser()
    const { path, todo, add, load } = await aBoard(owner)
    const brief = await add({ sectionId: todo.id, title: 'Brief' })
    const draft = await add({ parentId: brief, title: 'Draft' })
    await add({ parentId: brief, title: 'Review' })

    const response = await api
      .as(owner)
      .post(`${path}/tasks/${draft}/duplicate`, { title: 'Copy of Draft' })

    expect(response.statusCode).toBe(201)
    expect(
      (await load()).tasks
        .filter(task => task.parentId === brief)
        .map(task => task.title)
    ).toEqual(['Draft', 'Copy of Draft', 'Review'])
  })

  it('completes the sub-tasks of a copy in a done section, and notifies no one', async () => {
    const owner = aUser()
    const bob = aUser({ organizationId: owner.organizationId })
    const { board, path, add, load } = await aBoard(owner)
    await joinBoard(db, owner, board.id, bob, 'editor')
    const done = board.sections[2]
    const brief = await add({ sectionId: done?.id, title: 'Brief' })
    const draft = await add({ parentId: brief, title: 'Draft' })
    await api
      .as(owner)
      .put(`${path}/tasks/${draft}/assignees`, { userIds: [bob.userId] })
    const notifications = async () =>
      (await api.as(bob).get('/notifications')).json<{
        notifications: unknown[]
      }>().notifications.length
    const before = await notifications()

    const created = (
      await api
        .as(owner)
        .post(`${path}/tasks/${brief}/duplicate`, { title: 'Copy of Brief' })
    ).json<{ id: string }>()

    const tasks = (await load()).tasks
    const copy = tasks.find(task => task.id === created.id)
    const child = tasks.find(task => task.parentId === created.id)
    expect(copy?.completedAt).not.toBeNull()
    expect(child).toMatchObject({ assignees: [{ userId: bob.userId }] })
    expect(child?.completedAt).not.toBeNull()
    expect(await notifications()).toBe(before)
  })

  it('refuses a viewer and an archived task', async () => {
    const owner = aUser()
    const viewer = aUser({ organizationId: owner.organizationId })
    const { board, path, todo, add, load } = await aBoard(owner)
    await joinBoard(db, owner, board.id, viewer, 'viewer')
    const brief = await add({ sectionId: todo.id, title: 'Brief' })

    const refused = await api
      .as(viewer)
      .post(`${path}/tasks/${brief}/duplicate`, { title: 'Copy of Brief' })
    await api.as(owner).post(`${path}/tasks/${brief}/archive`, {})
    const archived = await api
      .as(owner)
      .post(`${path}/tasks/${brief}/duplicate`, { title: 'Copy of Brief' })

    expect(refused.statusCode).toBe(403)
    expect(archived.statusCode).toBe(409)
    expect((await load()).tasks).toEqual([])
  })

  it('does not copy a task from a board the person cannot open', async () => {
    const owner = aUser()
    const stranger = aUser()
    const { path, todo, add } = await aBoard(owner)
    const brief = await add({ sectionId: todo.id, title: 'Brief' })

    const response = await api
      .as(stranger)
      .post(`${path}/tasks/${brief}/duplicate`, { title: 'Copy of Brief' })

    expect(response.statusCode).toBe(404)
  })
})
