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
    parentId: string | null
  }[]
}

let api: Awaited<ReturnType<typeof startApp>>

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
})

async function aBoard(owner: TestUser, keyPrefix: string) {
  return (
    await api.as(owner).post('/boards', { name: keyPrefix, keyPrefix })
  ).json<Board>()
}

const load = async (user: TestUser, boardId: string) =>
  (await api.as(user).get(`/boards/${boardId}`)).json<Board>()

async function aTask(owner: TestUser, boardId: string, title: string) {
  return (
    await api
      .as(owner)
      .post(`/boards/${boardId}/tasks`, { sectionId: null, title })
  ).json<{ id: string }>().id
}

describe('moving a task to another board', () => {
  it('gives the task and its sub-tasks new keys, and finds them by the old ones', async () => {
    const owner = aUser()
    const design = await aBoard(owner, 'DES')
    const ops = await aBoard(owner, 'OPS')
    await aTask(owner, ops.id, 'Deploy')
    const logo = await aTask(owner, design.id, 'Logo')
    await api
      .as(owner)
      .post(`/boards/${design.id}/tasks`, { parentId: logo, title: 'Sketch' })
    const inProgress = ops.sections.find(
      section => section.name === 'In progress'
    )

    const moved = await api
      .as(owner)
      .post(`/boards/${design.id}/tasks/${logo}/transfer`, {
        boardId: ops.id,
        sectionId: inProgress?.id ?? null
      })

    expect(moved.statusCode).toBe(200)
    expect(moved.json()).toEqual({ key: 'OPS-2' })
    expect((await load(owner, design.id)).tasks).toEqual([])
    expect((await load(owner, ops.id)).tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: logo,
          key: 'OPS-2',
          sectionId: inProgress?.id
        }),
        expect.objectContaining({ key: 'OPS-3', parentId: logo })
      ])
    )
    const found = await api.as(owner).get('/search?q=DES-1')
    expect(
      found.json<{ tasks: { id: string; key: string }[] }>().tasks
    ).toEqual([expect.objectContaining({ id: logo, key: 'OPS-2' })])
  })

  it('unassigns people who are not on the target board', async () => {
    const owner = aUser()
    const bob = aUser({ organizationId: owner.organizationId })
    const design = await aBoard(owner, 'DES')
    const ops = await aBoard(owner, 'OPS')
    const logo = await aTask(owner, design.id, 'Logo')
    await api.as(owner).post(`/boards/${design.id}/invites`, {
      email: bob.email,
      role: 'editor'
    })
    await api.as(bob).get('/boards')
    await api.as(owner).put(`/boards/${design.id}/tasks/${logo}/assignees`, {
      userIds: [owner.userId, bob.userId]
    })

    await api.as(owner).post(`/boards/${design.id}/tasks/${logo}/transfer`, {
      boardId: ops.id,
      sectionId: null
    })

    expect((await load(owner, ops.id)).tasks).toEqual([
      expect.objectContaining({
        assignees: [{ userId: owner.userId, email: owner.email }]
      })
    ])
  })

  it('needs editor rights on both boards', async () => {
    const owner = aUser()
    const stranger = aUser({ organizationId: owner.organizationId })
    const design = await aBoard(owner, 'DES')
    const theirs = await aBoard(stranger, 'OPS')
    const logo = await aTask(owner, design.id, 'Logo')

    const moved = await api
      .as(owner)
      .post(`/boards/${design.id}/tasks/${logo}/transfer`, {
        boardId: theirs.id,
        sectionId: null
      })

    expect(moved.statusCode).toBe(404)
    expect((await load(owner, design.id)).tasks).toHaveLength(1)
  })

  it('refuses a sub-task, the same board and a section of another board', async () => {
    const owner = aUser()
    const design = await aBoard(owner, 'DES')
    const ops = await aBoard(owner, 'OPS')
    const logo = await aTask(owner, design.id, 'Logo')
    const sketch = (
      await api
        .as(owner)
        .post(`/boards/${design.id}/tasks`, { parentId: logo, title: 'Sketch' })
    ).json<{ id: string }>().id
    const transfer = (taskId: string, body: object) =>
      api.as(owner).post(`/boards/${design.id}/tasks/${taskId}/transfer`, body)

    expect(
      (await transfer(sketch, { boardId: ops.id, sectionId: null })).statusCode
    ).toBe(400)
    expect(
      (await transfer(logo, { boardId: design.id, sectionId: null })).statusCode
    ).toBe(400)
    expect(
      (
        await transfer(logo, {
          boardId: ops.id,
          sectionId: design.sections[0]?.id
        })
      ).statusCode
    ).toBe(400)
  })
})
