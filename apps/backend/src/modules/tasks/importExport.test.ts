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
  dueDate: string | null
  priority: number | null
  completedAt: string | null
  assignees: { userId: string }[]
  labels: { name: string }[]
}

interface Board {
  id: string
  sections: { id: string; name: string; category: string }[]
  labels: { name: string; color: string | null }[]
  tasks: Task[]
}

async function aBoard(owner: TestUser, keyPrefix = 'DES') {
  return (
    await api.as(owner).post('/boards', { name: 'Design', keyPrefix })
  ).json<Board>()
}

const boardOf = async (user: TestUser, boardId: string) =>
  (await api.as(user).get(`/boards/${boardId}`)).json<Board>()

const importRows = (user: TestUser, boardId: string, rows: object[]) =>
  api.as(user).post(`/boards/${boardId}/import`, { rows })

describe('exporting a board', () => {
  it('lists every task in board order, each sub-task after its parent', async () => {
    const alice = aUser()
    const viewer = aUser({ organizationId: alice.organizationId })
    const board = await aBoard(alice)
    await joinBoard(db, alice, board.id, viewer, 'viewer')
    const [first, second] = board.sections
    const at = `/boards/${board.id}/tasks`
    const later = (
      await api
        .as(alice)
        .post(at, { sectionId: second?.id ?? null, title: 'Later' })
    ).json<{ id: string }>()
    const brief = (
      await api
        .as(alice)
        .post(at, { sectionId: first?.id ?? null, title: 'Brief' })
    ).json<{ id: string }>()
    await api.as(alice).post(at, { parentId: brief.id, title: 'Outline' })
    await api.as(alice).put(`${at}/${brief.id}/description`, {
      markdown: 'Read **the** notes',
      version: 0
    })
    await api.as(alice).post(`${at}/${later.id}/archive`, {})

    const shown = await api.as(viewer).get(`/boards/${board.id}/export`)

    expect(shown.statusCode).toBe(200)
    expect(shown.json()).toMatchObject({
      tasks: [
        {
          key: 'DES-2',
          title: 'Brief',
          description: 'Read the notes',
          archived: false,
          createdBy: { userId: alice.userId, email: alice.email }
        },
        { key: 'DES-3', title: 'Outline', parentId: brief.id }
      ]
    })
    const all = await api
      .as(viewer)
      .get(`/boards/${board.id}/export?archived=true`)
    expect(
      all.json<{ tasks: { title: string; archived: boolean }[] }>().tasks
    ).toMatchObject([
      { title: 'Brief' },
      { title: 'Outline' },
      { title: 'Later', archived: true }
    ])
  })

  it('is refused to someone outside the board', async () => {
    const alice = aUser()
    const board = await aBoard(alice)

    const response = await api.as(aUser()).get(`/boards/${board.id}/export`)

    expect(response.statusCode).toBe(404)
  })
})

describe('importing tasks', () => {
  it('creates the tasks in their sections, with an unknown section added', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
    const [first] = board.sections

    const response = await importRows(alice, board.id, [
      {
        title: 'Brief',
        section: first?.name.toUpperCase(),
        dueDate: '2026-11-20'
      },
      {
        title: 'Launch',
        section: 'Waiting',
        priority: 1,
        dueDate: '2026-12-01',
        dueTime: '09:30'
      },
      { title: 'Retro' }
    ])

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      imported: 3,
      skipped: [],
      unknownAssignees: [],
      unplacedSections: []
    })
    const after = await boardOf(alice, board.id)
    const waiting = after.sections.at(-1)
    expect(waiting).toMatchObject({ name: 'Waiting', category: 'unstarted' })
    expect(after.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'DES-1',
          title: 'Brief',
          sectionId: first?.id,
          dueDate: '2026-11-20'
        }),
        expect.objectContaining({
          key: 'DES-2',
          title: 'Launch',
          sectionId: waiting?.id,
          priority: 1
        }),
        expect.objectContaining({ key: 'DES-3', sectionId: first?.id })
      ])
    )
  })

  it('puts an editor’s unknown section in the first one, since only admins add sections', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const board = await aBoard(alice)
    await joinBoard(db, alice, board.id, bob, 'editor')

    const response = await importRows(bob, board.id, [
      { title: 'Brief', section: 'Waiting' }
    ])

    expect(response.json()).toMatchObject({ unplacedSections: ['Waiting'] })
    const after = await boardOf(alice, board.id)
    expect(after.sections).toHaveLength(board.sections.length)
    expect(after.tasks[0]?.sectionId).toBe(board.sections[0]?.id)
  })

  it('assigns members only, labels the tasks and tells no one', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const board = await aBoard(alice)
    await joinBoard(db, alice, board.id, bob, 'editor')

    const response = await importRows(alice, board.id, [
      {
        title: 'Brief',
        assignees: [bob.email.toUpperCase(), 'stranger@example.com'],
        labels: ['Brand', 'brand']
      }
    ])

    expect(response.json()).toMatchObject({
      unknownAssignees: ['stranger@example.com']
    })
    const after = await boardOf(alice, board.id)
    expect(after.labels).toEqual([
      expect.objectContaining({ name: 'Brand', color: null })
    ])
    const [task] = after.tasks
    expect(task).toMatchObject({
      assignees: [{ userId: bob.userId }],
      labels: [{ name: 'Brand' }]
    })
    const notifications = await api.as(bob).get('/notifications')
    expect(notifications.json()).toMatchObject({ notifications: [] })
    const following = await api
      .as(bob)
      .get(`/boards/${board.id}/tasks/${task?.id ?? ''}/follow`)
    expect(following.json()).toMatchObject({ following: true })
    const history = await api
      .as(alice)
      .get(`/boards/${board.id}/tasks/${task?.id ?? ''}/history`)
    expect(
      history.json<{ entries: { field: string; from: unknown }[] }>().entries
    ).toContainEqual(
      expect.objectContaining({ field: 'created', from: 'import' })
    )
  })

  it('nests sub-tasks under rows of the file or tasks of the board, and skips the rest', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
    await api
      .as(alice)
      .post(`/boards/${board.id}/tasks`, { sectionId: null, title: 'Old' })

    const response = await importRows(alice, board.id, [
      { key: 'X-2', parentKey: 'X-1', title: 'Child' },
      { key: 'X-1', title: 'Parent' },
      { parentKey: 'des-1', title: 'Under old' },
      { parentKey: 'NOPE-9', title: 'Orphan' },
      { key: 'A', parentKey: 'B', title: 'Loop A' },
      { key: 'B', parentKey: 'A', title: 'Loop B' }
    ])

    expect(response.json()).toMatchObject({
      imported: 3,
      skipped: [
        { row: 3, reason: 'parent' },
        { row: 4, reason: 'parent' },
        { row: 5, reason: 'parent' }
      ]
    })
    const tasks = (await boardOf(alice, board.id)).tasks
    const byTitle = (title: string) => tasks.find(task => task.title === title)
    expect(byTitle('Child')?.parentId).toBe(byTitle('Parent')?.id)
    expect(byTitle('Child')?.sectionId).toBeNull()
    expect(byTitle('Under old')?.parentId).toBe(byTitle('Old')?.id)
  })

  it('refuses more than a thousand rows, and a viewer', async () => {
    const alice = aUser()
    const viewer = aUser({ organizationId: alice.organizationId })
    const board = await aBoard(alice)
    await joinBoard(db, alice, board.id, viewer, 'viewer')
    const rows = Array.from({ length: 1001 }, (_, index) => ({
      title: `Task ${String(index)}`
    }))

    expect((await importRows(alice, board.id, rows)).statusCode).toBe(400)
    expect(
      (await importRows(viewer, board.id, [{ title: 'Brief' }])).statusCode
    ).toBe(403)
    expect((await boardOf(alice, board.id)).tasks).toEqual([])
  })

  it('imports a thousand rows in one request', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
    const rows = Array.from({ length: 1000 }, (_, index) => ({
      title: `Task ${String(index)}`,
      description: 'x'.repeat(2000)
    }))

    const response = await importRows(alice, board.id, rows)

    expect(response.json()).toMatchObject({ imported: 1000 })
    expect((await boardOf(alice, board.id)).tasks).toHaveLength(1000)
  }, 30_000)
})
