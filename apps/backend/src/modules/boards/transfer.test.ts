import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { aUser, joinBoard, startApp, type TestUser } from '../../testing/app.ts'

interface Label {
  id: string
  name: string
}

interface Board {
  id: string
  project: { id: string }
  labels: Label[]
  sections: { id: string; name: string }[]
  tasks: {
    id: string
    key: string
    title: string
    sectionId: string | null
    parentId: string | null
    labels: Label[]
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

async function aLabel(owner: TestUser, boardId: string, name: string) {
  return (
    await api.as(owner).post(`/boards/${boardId}/labels`, { name })
  ).json<Label>().id
}

const labelTask = (
  owner: TestUser,
  boardId: string,
  taskId: string,
  labelIds: string[]
) =>
  api.as(owner).put(`/boards/${boardId}/tasks/${taskId}/labels`, { labelIds })

const names = (labels: Label[]) => labels.map(label => label.name).sort()

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
    expect(moved.json()).toEqual({
      key: 'OPS-2',
      droppedAssignees: [],
      createdLabels: []
    })
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
        assignees: [
          { userId: owner.userId, email: owner.email, name: null, avatar: null }
        ]
      })
    ])
  })

  describe('labels', () => {
    async function aLabeledTask(owner: TestUser) {
      const design = await aBoard(owner, 'DES')
      const ops = await aBoard(owner, 'OPS')
      const logo = await aTask(owner, design.id, 'Logo')
      const sketch = (
        await api.as(owner).post(`/boards/${design.id}/tasks`, {
          parentId: logo,
          title: 'Sketch'
        })
      ).json<{ id: string }>().id
      const urgent = await aLabel(owner, design.id, 'Urgent')
      const brand = await aLabel(owner, design.id, 'Brand')
      await labelTask(owner, design.id, logo, [urgent, brand])
      await labelTask(owner, design.id, sketch, [brand])
      return { design, ops, logo, sketch }
    }

    it('attaches a label to the one of the same name in the other project, and creates the missing ones', async () => {
      const owner = aUser()
      const { design, ops, logo, sketch } = await aLabeledTask(owner)
      const existing = await aLabel(owner, ops.id, 'Urgent')

      const moved = await api
        .as(owner)
        .post(`/boards/${design.id}/tasks/${logo}/transfer`, {
          boardId: ops.id,
          sectionId: null
        })

      expect(moved.json()).toMatchObject({ createdLabels: ['Brand'] })
      const board = await load(owner, ops.id)
      expect(names(board.labels)).toEqual(['Brand', 'Urgent'])
      expect(board.labels.find(label => label.name === 'Urgent')?.id).toBe(
        existing
      )
      const byId = (id: string) => board.tasks.find(task => task.id === id)
      expect(names(byId(logo)?.labels ?? [])).toEqual(['Brand', 'Urgent'])
      expect(names(byId(sketch)?.labels ?? [])).toEqual(['Brand'])
      expect(byId(logo)?.labels.map(label => label.id)).toEqual(
        expect.arrayContaining(board.labels.map(label => label.id))
      )
      expect(names((await load(owner, design.id)).labels)).toEqual([
        'Brand',
        'Urgent'
      ])
    })

    it('keeps the labels when the other board is in the same project', async () => {
      const owner = aUser()
      const design = await aBoard(owner, 'DES')
      const ops = (
        await api.as(owner).post('/boards', {
          name: 'Ops',
          keyPrefix: 'OPS',
          projectId: design.project.id
        })
      ).json<Board>()
      const logo = await aTask(owner, design.id, 'Logo')
      const urgent = await aLabel(owner, design.id, 'Urgent')
      await labelTask(owner, design.id, logo, [urgent])

      const moved = await api
        .as(owner)
        .post(`/boards/${design.id}/tasks/${logo}/transfer`, {
          boardId: ops.id,
          sectionId: null
        })

      expect(moved.json()).toMatchObject({ createdLabels: [] })
      expect((await load(owner, ops.id)).tasks[0]?.labels).toEqual([
        { id: urgent, name: 'Urgent' }
      ])
    })

    it('does not create labels in a project the mover only views', async () => {
      const owner = aUser()
      const viewer = aUser({ organizationId: owner.organizationId })
      const design = await aBoard(viewer, 'DES')
      const ops = await aBoard(owner, 'OPS')
      await joinBoard(db, owner, ops.id, viewer, 'viewer')
      const logo = await aTask(viewer, design.id, 'Logo')
      await labelTask(viewer, design.id, logo, [
        await aLabel(viewer, design.id, 'Urgent')
      ])

      const moved = await api
        .as(viewer)
        .post(`/boards/${design.id}/tasks/${logo}/transfer`, {
          boardId: ops.id,
          sectionId: null
        })

      expect(moved.statusCode).toBe(403)
      expect((await load(owner, ops.id)).labels).toEqual([])
    })
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
