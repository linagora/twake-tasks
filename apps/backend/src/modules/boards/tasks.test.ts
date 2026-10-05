import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'

interface Board {
  id: string
  sections: { id: string; name: string }[]
  tasks: {
    id: string
    key: string
    title: string
    sectionId: string | null
    completedAt: string | null
  }[]
}

let api: Awaited<ReturnType<typeof startApp>>

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
})

async function aBoard(user: TestUser) {
  const board = (
    await api.as(user).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<Board>()
  const [todo, doing, done] = board.sections
  if (!todo || !doing || !done) throw new Error('missing default sections')
  return { board, todo, doing, done }
}

async function tasksOf(user: TestUser, boardId: string) {
  return (await api.as(user).get(`/boards/${boardId}`)).json<Board>().tasks
}

async function aTask(
  user: TestUser,
  boardId: string,
  sectionId: string | null,
  title: string
) {
  return (
    await api.as(user).post(`/boards/${boardId}/tasks`, { sectionId, title })
  ).json<{ id: string }>().id
}

async function versionOf(user: TestUser, boardId: string) {
  return (await api.as(user).get(`/boards/${boardId}`)).json<{
    version: number
  }>().version
}

function titlesIn(tasks: Board['tasks'], sectionId: string | null) {
  return tasks
    .filter(task => task.sectionId === sectionId)
    .map(task => task.title)
}

describe('tasks', () => {
  it('numbers new tasks on the board and adds them at the end', async () => {
    const alice = aUser()
    const { board, todo } = await aBoard(alice)

    const first = await api
      .as(alice)
      .post(`/boards/${board.id}/tasks`, { sectionId: todo.id, title: 'Logo' })
    await api
      .as(alice)
      .post(`/boards/${board.id}/tasks`, { sectionId: todo.id, title: 'Fonts' })

    expect(first.statusCode).toBe(201)
    expect(first.json()).toMatchObject({ key: 'DES-1', title: 'Logo' })
    expect(
      (await tasksOf(alice, board.id)).map(task => [task.key, task.title])
    ).toEqual([
      ['DES-1', 'Logo'],
      ['DES-2', 'Fonts']
    ])
  })

  it('keeps tasks without a section in their own order', async () => {
    const alice = aUser()
    const { board, todo } = await aBoard(alice)
    await aTask(alice, board.id, null, 'Logo')
    const fonts = await aTask(alice, board.id, null, 'Fonts')
    await aTask(alice, board.id, todo.id, 'Colors')

    await api
      .as(alice)
      .post(`/boards/${board.id}/tasks/${fonts}/move`, { sectionId: null })
    await aTask(alice, board.id, null, 'Icons')

    const tasks = await tasksOf(alice, board.id)
    expect(titlesIn(tasks, null)).toEqual(['Logo', 'Fonts', 'Icons'])
    expect(titlesIn(tasks, todo.id)).toEqual(['Colors'])
  })

  it('refuses a section from another board without touching the board', async () => {
    const alice = aUser()
    const { board } = await aBoard(alice)
    const other = (
      await api.as(alice).post('/boards', { name: 'Ops', keyPrefix: 'OPS' })
    ).json<Board>()
    const before = await versionOf(alice, board.id)

    const response = await api.as(alice).post(`/boards/${board.id}/tasks`, {
      sectionId: other.sections[0]?.id,
      title: 'Lost'
    })

    expect(response.statusCode).toBe(400)
    expect(await versionOf(alice, board.id)).toBe(before)
  })

  it('moves a task between two others and into another section', async () => {
    const alice = aUser()
    const { board, todo, done } = await aBoard(alice)
    const logo = await aTask(alice, board.id, todo.id, 'Logo')
    const fonts = await aTask(alice, board.id, todo.id, 'Fonts')
    const colors = await aTask(alice, board.id, todo.id, 'Colors')
    const move = (taskId: string, body: object) =>
      api.as(alice).post(`/boards/${board.id}/tasks/${taskId}/move`, body)

    const between = await move(colors, {
      sectionId: todo.id,
      afterId: logo,
      beforeId: fonts
    })
    await move(logo, { sectionId: done.id })

    expect(between.statusCode).toBe(204)
    const tasks = await tasksOf(alice, board.id)
    expect(titlesIn(tasks, todo.id)).toEqual(['Colors', 'Fonts'])
    expect(titlesIn(tasks, done.id)).toEqual(['Logo'])
    expect(tasks.find(task => task.title === 'Logo')?.completedAt).toEqual(
      expect.any(String)
    )
  })

  it('reopens a task moved out of a done section', async () => {
    const alice = aUser()
    const { board, todo, done } = await aBoard(alice)
    const logo = await aTask(alice, board.id, done.id, 'Logo')

    await api
      .as(alice)
      .post(`/boards/${board.id}/tasks/${logo}/move`, { sectionId: todo.id })

    const [task] = await tasksOf(alice, board.id)
    expect(task).toMatchObject({ sectionId: todo.id, completedAt: null })
  })

  it('refuses neighbours that are not next to each other', async () => {
    const alice = aUser()
    const { board, todo, doing } = await aBoard(alice)
    const logo = await aTask(alice, board.id, todo.id, 'Logo')
    const fonts = await aTask(alice, board.id, doing.id, 'Fonts')
    const colors = await aTask(alice, board.id, todo.id, 'Colors')
    const before = await versionOf(alice, board.id)

    const response = await api
      .as(alice)
      .post(`/boards/${board.id}/tasks/${colors}/move`, {
        sectionId: todo.id,
        afterId: fonts,
        beforeId: logo
      })

    expect(response.statusCode).toBe(409)
    expect(await versionOf(alice, board.id)).toBe(before)
  })

  it('edits the title, priority and due date, and clears them', async () => {
    const alice = aUser()
    const { board, todo } = await aBoard(alice)
    const logo = await aTask(alice, board.id, todo.id, 'Logo')
    const edit = (body: object) =>
      api.as(alice).patch(`/boards/${board.id}/tasks/${logo}`, body)

    const edited = await edit({
      title: 'New logo',
      priority: 1,
      dueDate: '2026-11-02'
    })
    const [afterEdit] = await tasksOf(alice, board.id)
    await edit({ priority: null, dueDate: null })
    const [afterClear] = await tasksOf(alice, board.id)
    const invalid = await edit({ priority: 5 })
    const empty = await edit({})

    expect(edited.statusCode).toBe(204)
    expect(afterEdit).toMatchObject({
      title: 'New logo',
      priority: 1,
      dueDate: '2026-11-02'
    })
    expect(afterClear).toMatchObject({
      title: 'New logo',
      priority: null,
      dueDate: null
    })
    expect(invalid.statusCode).toBe(400)
    expect(empty.statusCode).toBe(400)
  })
})
