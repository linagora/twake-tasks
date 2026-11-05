import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import {
  aB2cUser,
  aUser,
  joinBoard,
  startApp,
  type TestUser
} from '../../testing/app.ts'

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
  completedAt: string | null
  labels: { name: string }[]
  assignees: { userId: string }[]
}

interface Board {
  id: string
  keyPrefix: string
  boardTemplate: boolean
  project: { id: string }
  labels: { id: string; name: string; color: string | null }[]
  sections: { id: string; name: string; category: string }[]
  tasks: Task[]
}

const copyOf = (
  boardId: string,
  options: Partial<Record<string, boolean>>
) => ({
  boardId,
  tasks: true,
  assignees: false,
  dueDates: false,
  ...options
})

async function aRunningBoard(owner: TestUser, guest?: TestUser) {
  const board = (
    await api.as(owner).post('/boards', { name: 'Launch', keyPrefix: 'LCH' })
  ).json<Board>()
  const path = `/boards/${board.id}`
  const [todo, doing, done] = board.sections
  await api.as(owner).post(`${path}/sections`, {
    name: 'In review',
    category: 'started'
  })
  const label = (
    await api
      .as(owner)
      .post(`${path}/labels`, { name: 'Press', color: '#AA0000' })
  ).json<{ id: string }>()
  const brief = (
    await api
      .as(owner)
      .post(`${path}/tasks`, { sectionId: todo?.id, title: 'Brief' })
  ).json<{ id: string }>()
  await api.as(owner).patch(`${path}/tasks/${brief.id}`, {
    priority: 2,
    dueDate: '2026-12-01'
  })
  await api.as(owner).put(`${path}/tasks/${brief.id}/labels`, {
    labelIds: [label.id]
  })
  if (guest) {
    await joinBoard(db, owner, board.id, guest, 'editor')
    await api.as(owner).put(`${path}/tasks/${brief.id}/assignees`, {
      userIds: [owner.userId, guest.userId]
    })
  }
  const step = (
    await api
      .as(owner)
      .post(`${path}/tasks`, { parentId: brief.id, title: 'Draft' })
  ).json<{ id: string }>()
  await api
    .as(owner)
    .post(`${path}/tasks/${step.id}/complete`, { state: 'completed' })
  await api
    .as(owner)
    .post(`${path}/tasks`, { sectionId: doing?.id, title: 'Visuals' })
  await api
    .as(owner)
    .post(`${path}/tasks`, { sectionId: done?.id, title: 'Kickoff' })
  return board
}

const boardOf = async (user: TestUser, boardId: string) =>
  (await api.as(user).get(`/boards/${boardId}`)).json<Board>()

describe('copying a board', () => {
  it('copies the sections, labels and open tasks into the same project', async () => {
    const owner = aUser()
    const source = await aRunningBoard(owner)
    const before = await boardOf(owner, source.id)

    const response = await api.as(owner).post('/boards', {
      name: 'Launch 2',
      keyPrefix: 'LCHB',
      projectId: source.project.id,
      copyOf: copyOf(source.id, {})
    })

    expect(response.statusCode).toBe(201)
    const copy = response.json<Board>()
    expect(copy.project.id).toBe(source.project.id)
    expect(
      copy.sections.map(({ name, category }) => ({ name, category }))
    ).toEqual(before.sections.map(({ name, category }) => ({ name, category })))
    const sectionName = (board: Board, id: string | null) =>
      board.sections.find(section => section.id === id)?.name ?? null
    const shape = (board: Board) =>
      board.tasks
        .map(task => ({
          title: task.title,
          section: sectionName(board, task.sectionId),
          parent:
            board.tasks.find(other => other.id === task.parentId)?.title ??
            null,
          priority: task.priority,
          dueDate: task.dueDate,
          done: task.completedAt !== null,
          labels: task.labels.map(label => label.name)
        }))
        .sort((a, b) => a.title.localeCompare(b.title))
    expect(shape(copy)).toEqual([
      {
        title: 'Brief',
        section: 'To do',
        parent: null,
        priority: 2,
        dueDate: null,
        done: false,
        labels: ['Press']
      },
      {
        title: 'Draft',
        section: null,
        parent: 'Brief',
        priority: null,
        dueDate: null,
        done: false,
        labels: []
      },
      {
        title: 'Visuals',
        section: 'In progress',
        parent: null,
        priority: null,
        dueDate: null,
        done: false,
        labels: []
      }
    ])
    expect(copy.tasks.map(task => task.key).sort()).toEqual([
      'LCHB-1',
      'LCHB-2',
      'LCHB-3'
    ])
    expect(await boardOf(owner, source.id)).toEqual(before)

    const brief = copy.tasks.find(task => task.title === 'Brief')
    const original = before.tasks.find(task => task.title === 'Brief')
    const history = (
      await api
        .as(owner)
        .get(`/boards/${copy.id}/tasks/${brief?.id ?? ''}/history`)
    ).json<{ entries: { field: string; from: unknown }[] }>()
    expect(history.entries).toContainEqual(
      expect.objectContaining({ field: 'created', from: original?.key })
    )
  })

  it('keeps due dates and the assignees the target project has, when asked', async () => {
    const owner = aUser()
    const guest = aUser({ organizationId: owner.organizationId })
    const source = await aRunningBoard(owner, guest)

    const copy = (
      await api.as(owner).post('/boards', {
        name: 'Launch for us',
        keyPrefix: 'MINE',
        copyOf: copyOf(source.id, { assignees: true, dueDates: true })
      })
    ).json<Board>()

    expect(copy.project.id).not.toBe(source.project.id)
    const brief = copy.tasks.find(task => task.title === 'Brief')
    expect(brief).toMatchObject({
      dueDate: '2026-12-01',
      assignees: [{ userId: owner.userId }],
      labels: [{ name: 'Press' }]
    })
    expect(copy.labels).toMatchObject([{ name: 'Press', color: '#AA0000' }])
  })

  it('copies only the sections without the tasks option', async () => {
    const owner = aUser()
    const source = await aRunningBoard(owner)

    const copy = (
      await api.as(owner).post('/boards', {
        name: 'Empty launch',
        keyPrefix: 'EMPTY',
        copyOf: copyOf(source.id, { tasks: false })
      })
    ).json<Board>()

    expect(copy.sections.map(section => section.name)).toEqual([
      'To do',
      'In progress',
      'Done',
      'In review'
    ])
    expect(copy.tasks).toEqual([])
  })

  it('creates nothing when the key prefix is taken', async () => {
    const owner = aUser()
    const source = await aRunningBoard(owner)

    const response = await api.as(owner).post('/boards', {
      name: 'Again',
      keyPrefix: 'LCH',
      copyOf: copyOf(source.id, {})
    })

    expect(response.statusCode).toBe(409)
    const listed = (await api.as(owner).get('/boards'))
      .json<{ boards: { name: string }[] }>()
      .boards.map(board => board.name)
    expect(listed).not.toContain('Again')
  })

  it('does not copy a board the person cannot see', async () => {
    const owner = aB2cUser()
    const stranger = aB2cUser()
    const source = await aRunningBoard(owner)

    const response = await api.as(stranger).post('/boards', {
      name: 'Stolen',
      keyPrefix: 'STO',
      copyOf: copyOf(source.id, {})
    })

    expect(response.statusCode).toBe(404)
  })
})

describe('board templates', () => {
  it('lets an admin mark a board as a template for its project', async () => {
    const owner = aUser()
    const editor = aUser({ organizationId: owner.organizationId })
    const source = await aRunningBoard(owner)
    await joinBoard(db, owner, source.id, editor, 'editor')
    const template = `/boards/${source.id}/board-template`

    expect((await api.as(editor).put(template)).statusCode).toBe(403)
    expect((await api.as(owner).put(template)).statusCode).toBe(204)

    expect((await boardOf(editor, source.id)).boardTemplate).toBe(true)
    const listed = (await api.as(editor).get('/boards'))
      .json<{ boards: { id: string; boardTemplate: boolean }[] }>()
      .boards.find(board => board.id === source.id)
    expect(listed?.boardTemplate).toBe(true)

    expect((await api.as(owner).delete(template)).statusCode).toBe(204)
    expect((await boardOf(owner, source.id)).boardTemplate).toBe(false)
  })
})
