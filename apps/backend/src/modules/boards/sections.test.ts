import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { aUser, joinBoard, startApp, type TestUser } from '../../testing/app.ts'

interface Board {
  id: string
  version: number
  sections: { id: string; name: string; category: string }[]
  tasks: {
    title: string
    sectionId: string | null
    completedAt: string | null
  }[]
}

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

async function aBoard(user: TestUser) {
  const board = (
    await api.as(user).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<Board>()
  const [todo, doing, done] = board.sections
  if (!todo || !doing || !done) throw new Error('missing default sections')
  return { board, todo, doing, done }
}

const boardOf = async (user: TestUser, boardId: string) =>
  (await api.as(user).get(`/boards/${boardId}`)).json<Board>()

const sectionNames = async (user: TestUser, boardId: string) =>
  (await boardOf(user, boardId)).sections.map(section => section.name)

async function aTask(
  user: TestUser,
  boardId: string,
  sectionId: string | null,
  title: string
) {
  await api.as(user).post(`/boards/${boardId}/tasks`, { sectionId, title })
}

describe('sections', () => {
  it('adds a section at the end or after another', async () => {
    const alice = aUser()
    const { board, todo } = await aBoard(alice)

    const last = await api.as(alice).post(`/boards/${board.id}/sections`, {
      name: 'Review',
      category: 'started'
    })
    await api.as(alice).post(`/boards/${board.id}/sections`, {
      name: 'Backlog',
      category: 'backlog',
      afterId: todo.id
    })

    expect(last.statusCode).toBe(201)
    expect(last.json()).toMatchObject({ name: 'Review', category: 'started' })
    expect(await sectionNames(alice, board.id)).toEqual([
      'To do',
      'Backlog',
      'In progress',
      'Done',
      'Review'
    ])
  })

  it('renames a section and recategorizes its tasks', async () => {
    const alice = aUser()
    const { board, doing } = await aBoard(alice)
    await aTask(alice, board.id, doing.id, 'Logo')

    const edited = await api
      .as(alice)
      .patch(`/boards/${board.id}/sections/${doing.id}`, {
        name: 'Shipped',
        category: 'completed'
      })
    const after = await boardOf(alice, board.id)

    expect(edited.statusCode).toBe(204)
    expect(after.sections[1]).toMatchObject({
      name: 'Shipped',
      category: 'completed'
    })
    expect(after.tasks[0]?.completedAt).not.toBeNull()
  })

  it('moves a section between two others', async () => {
    const alice = aUser()
    const { board, todo, doing, done } = await aBoard(alice)

    const moved = await api
      .as(alice)
      .post(`/boards/${board.id}/sections/${done.id}/move`, {
        afterId: todo.id,
        beforeId: doing.id
      })

    expect(moved.statusCode).toBe(204)
    expect(await sectionNames(alice, board.id)).toEqual([
      'To do',
      'Done',
      'In progress'
    ])
  })

  it('asks where the tasks go before deleting a section that has some', async () => {
    const alice = aUser()
    const { board, todo, doing, done } = await aBoard(alice)
    await aTask(alice, board.id, done.id, 'Shipped')
    await aTask(alice, board.id, todo.id, 'Logo')
    await aTask(alice, board.id, todo.id, 'Fonts')
    const path = (id: string) => `/boards/${board.id}/sections/${id}`

    const refused = await api.as(alice).delete(path(todo.id))
    const deleted = await api
      .as(alice)
      .delete(path(todo.id), { tasksTo: done.id })
    const emptied = await api.as(alice).delete(path(done.id), { tasksTo: null })
    const empty = await api.as(alice).delete(path(doing.id))
    const after = await boardOf(alice, board.id)

    expect(refused.statusCode).toBe(409)
    expect(refused.json()).toEqual({ error: 'section_not_empty' })
    expect([deleted.statusCode, emptied.statusCode, empty.statusCode]).toEqual([
      204, 204, 204
    ])
    expect(after.sections).toEqual([])
    expect(
      after.tasks.map(task => [task.title, task.sectionId, task.completedAt])
    ).toEqual([
      ['Shipped', null, null],
      ['Logo', null, null],
      ['Fonts', null, null]
    ])
  })

  it('lets only board admins manage sections', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const { board, todo } = await aBoard(alice)
    await joinBoard(db, alice, board.id, bob, 'editor')
    const outsider = aUser({ organizationId: alice.organizationId })
    const rename = (user: TestUser) =>
      api
        .as(user)
        .patch(`/boards/${board.id}/sections/${todo.id}`, { name: 'Later' })

    expect((await rename(bob)).statusCode).toBe(403)
    expect((await rename(outsider)).statusCode).toBe(404)
    expect(await sectionNames(alice, board.id)).toEqual([
      'To do',
      'In progress',
      'Done'
    ])
  })
})
