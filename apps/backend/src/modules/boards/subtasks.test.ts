import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'

interface Board {
  id: string
  sections: { id: string; name: string }[]
  tasks: {
    id: string
    title: string
    sectionId: string | null
    parentId: string | null
    completedAt: string | null
    canceledAt: string | null
  }[]
}

let api: Awaited<ReturnType<typeof startApp>>

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
})

async function aBoard(user: TestUser, keyPrefix = 'DES') {
  const board = (
    await api.as(user).post('/boards', { name: 'Design', keyPrefix })
  ).json<Board>()
  const add = async (input: object) => {
    const response = await api.as(user).post(`/boards/${board.id}/tasks`, input)
    return { status: response.statusCode, ...response.json<{ id: string }>() }
  }
  const load = async () =>
    (await api.as(user).get(`/boards/${board.id}`)).json<Board>()
  const task = async (id: string) =>
    (await load()).tasks.find(candidate => candidate.id === id)
  return { board, add, load, task }
}

describe('sub-tasks', () => {
  it('adds a sub-task inside its parent, outside any section', async () => {
    const alice = aUser()
    const { board, add, task } = await aBoard(alice)
    const parent = await add({
      sectionId: board.sections[0]?.id,
      title: 'Logo'
    })

    const child = await add({ parentId: parent.id, title: 'Sketch' })

    expect(child.status).toBe(201)
    expect(await task(child.id)).toMatchObject({
      title: 'Sketch',
      parentId: parent.id,
      sectionId: null
    })
  })

  it('nests up to 4 levels', async () => {
    const alice = aUser()
    const { board, add } = await aBoard(alice)
    let parent = await add({ sectionId: board.sections[0]?.id, title: '1' })
    for (const title of ['2', '3', '4']) {
      parent = await add({ parentId: parent.id, title })
      expect(parent.status).toBe(201)
    }

    const fifth = await add({ parentId: parent.id, title: '5' })

    expect(fifth).toMatchObject({ status: 400, error: 'too_deep' })
  })

  it('refuses a parent from another board', async () => {
    const alice = aUser()
    const design = await aBoard(alice, 'DES')
    const ops = await aBoard(alice, 'OPS')
    const parent = await ops.add({ sectionId: null, title: 'Elsewhere' })

    const child = await design.add({ parentId: parent.id, title: 'Sketch' })

    expect(child).toMatchObject({ status: 400, error: 'invalid_parent' })
  })

  it('completes the open sub-tasks of a completed parent, at every level', async () => {
    const alice = aUser()
    const { board, add, task } = await aBoard(alice)
    const [todo, , done] = board.sections
    const parent = await add({ sectionId: todo?.id, title: 'Logo' })
    const child = await add({ parentId: parent.id, title: 'Sketch' })
    const grandchild = await add({ parentId: child.id, title: 'Colors' })
    const canceled = await add({ parentId: parent.id, title: 'Font' })
    await api
      .as(alice)
      .post(`/boards/${board.id}/tasks/${canceled.id}/complete`, {
        state: 'canceled'
      })

    await api.as(alice).post(`/boards/${board.id}/tasks/${parent.id}/move`, {
      sectionId: done?.id
    })

    expect((await task(child.id))?.completedAt).not.toBeNull()
    expect((await task(grandchild.id))?.completedAt).not.toBeNull()
    expect(await task(canceled.id)).toMatchObject({ completedAt: null })
    expect((await task(canceled.id))?.canceledAt).not.toBeNull()
  })

  it('completes and reopens a sub-task by its own flag', async () => {
    const alice = aUser()
    const { board, add, task } = await aBoard(alice)
    const parent = await add({
      sectionId: board.sections[0]?.id,
      title: 'Logo'
    })
    const child = await add({ parentId: parent.id, title: 'Sketch' })
    const complete = (state: string | null) =>
      api
        .as(alice)
        .post(`/boards/${board.id}/tasks/${child.id}/complete`, { state })

    expect((await complete('completed')).statusCode).toBe(204)
    expect((await task(child.id))?.completedAt).not.toBeNull()

    await complete(null)
    expect(await task(child.id)).toMatchObject({
      completedAt: null,
      canceledAt: null
    })
    expect(await task(parent.id)).toMatchObject({ completedAt: null })
  })

  it('keeps a sub-task out of the sections', async () => {
    const alice = aUser()
    const { board, add } = await aBoard(alice)
    const parent = await add({
      sectionId: board.sections[0]?.id,
      title: 'Logo'
    })
    const child = await add({ parentId: parent.id, title: 'Sketch' })

    const moved = await api
      .as(alice)
      .post(`/boards/${board.id}/tasks/${child.id}/move`, {
        sectionId: board.sections[1]?.id
      })

    expect(moved.statusCode).toBe(400)
    expect(moved.json()).toEqual({ error: 'invalid_section' })
  })
})
