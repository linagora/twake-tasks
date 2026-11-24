import { connect, type Socket } from 'node:net'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { anIdentity } from '../auth/testing.ts'
import { aUser, joinBoard, startApp } from '../../testing/app.ts'
import { createDb } from '../../infra/db.ts'
import { createBoardStore } from './store.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql: setup, db } = createDb(inject('databaseUrl'))

// postgres.js gathers the messages of one tick into a single write, so each
// write waits on the server. Its types leave out the `socket` option.
let writes = 0
const url = new URL(inject('databaseUrl'))
const counted = {
  max: 1,
  onnotice: () => undefined,
  socket: () =>
    new Promise<Socket>((resolve, reject) => {
      const socket = connect(Number(url.port || 5432), url.hostname, () => {
        resolve(socket)
      })
      socket.once('error', reject)
      const write = socket.write.bind(socket) as (...args: unknown[]) => boolean
      socket.write = (...args: unknown[]) => {
        writes += 1
        return write(...args)
      }
    })
}
const client = postgres(url.toString(), counted)
const store = createBoardStore(drizzle({ client }))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await client.end()
  await setup.end()
})

// Assigned, labeled, commented, made from a template and blocked by a task of
// the board, on a board with an invite and a layout of the owner's own.
async function aFullBoard() {
  const owner = aUser()
  const mate = aUser({ organizationId: owner.organizationId })
  const as = api.as(owner)
  const board = (
    await as.post('/boards', { name: 'Launch', keyPrefix: 'LAU' })
  ).json<{ id: string; project: { id: string } }>()
  await joinBoard(db, owner, board.id, mate, 'editor')
  const at = `/boards/${board.id}/tasks`
  const blocker = (
    await as.post(at, { sectionId: null, title: 'Blocker' })
  ).json<{ id: string }>()
  const template = (
    await as.post(`/projects/${board.project.id}/templates`, {
      title: 'Weekly',
      description: '',
      priority: null,
      labelIds: [],
      assigneeIds: []
    })
  ).json<{ id: string }>()
  const task = (
    await as.post(at, {
      sectionId: null,
      title: 'Ship',
      templateId: template.id
    })
  ).json<{ id: string }>()
  const label = (
    await as.post(`/boards/${board.id}/labels`, { name: 'Urgent' })
  ).json<{ id: string }>()
  await as.put(`${at}/${task.id}/assignees`, { userIds: [mate.userId] })
  await as.put(`${at}/${task.id}/labels`, { labelIds: [label.id] })
  await as.post(`${at}/${task.id}/comments`, { body: 'One' })
  await as.post(`${at}/${task.id}/comments`, { body: 'Two' })
  await as.post(`${at}/${task.id}/links`, {
    kind: 'blockedBy',
    taskId: blocker.id
  })
  await as.put(`/boards/${board.id}/layout`, { layout: 'list' })
  const guest = `guest-${board.id}@example.com`
  await as.post(`/boards/${board.id}/invites`, { email: guest, role: 'viewer' })
  return {
    identity: anIdentity({ ...owner, subject: owner.email }),
    owner,
    mate,
    guest,
    boardId: board.id,
    templateId: template.id,
    labelId: label.id
  }
}

describe('opening a board', () => {
  it('reads the board, its tasks and what they show in few round trips', async () => {
    const { identity, boardId } = await aFullBoard()
    await store.getBoard(identity, boardId)

    writes = 0
    const board = await store.getBoard(identity, boardId)

    expect(board?.tasks).toHaveLength(2)
    // BEGIN and COMMIT, then the tenant settings, the board and its tasks,
    // each a parse and describe, then a bind and execute.
    expect(writes).toBe(8)
  })

  it('answers what the board, its people and its tasks hold', async () => {
    const { identity, owner, mate, guest, boardId, templateId, labelId } =
      await aFullBoard()

    const board = await store.getBoard(identity, boardId)

    const people = [owner, mate]
      .map(person => ({
        userId: person.userId,
        email: person.email,
        name: null,
        avatar: null
      }))
      .sort((one, other) => one.email.localeCompare(other.email))
    expect(board).toMatchObject({
      name: 'Launch',
      role: 'admin',
      layout: 'list',
      defaultLayout: 'board',
      members: people,
      invited: [guest],
      labels: [{ id: labelId, name: 'Urgent', color: null }],
      sections: [
        { name: 'To do', category: 'unstarted' },
        { name: 'In progress', category: 'started' },
        { name: 'Done', category: 'completed' }
      ]
    })
    expect(board?.tasks).toEqual([
      expect.objectContaining({
        key: 'LAU-1',
        title: 'Blocker',
        assignees: [],
        labels: [],
        commentCount: 0,
        blockers: [],
        template: null
      }),
      expect.objectContaining({
        key: 'LAU-2',
        title: 'Ship',
        assignees: [people.find(person => person.userId === mate.userId)],
        labels: [{ id: labelId, name: 'Urgent', color: null }],
        commentCount: 2,
        blockers: [{ key: 'LAU-1', title: 'Blocker' }],
        template: { id: templateId, title: 'Weekly' }
      })
    ])
  })

  it('shows no invites to an editor', async () => {
    const { mate, boardId } = await aFullBoard()

    const board = await store.getBoard(
      anIdentity({ ...mate, subject: mate.email }),
      boardId
    )

    expect(board).toMatchObject({ role: 'editor', invited: [] })
  })

  it('answers nothing to someone outside the project', async () => {
    const { owner, boardId } = await aFullBoard()
    const stranger = aUser({ organizationId: owner.organizationId })

    expect(
      await store.getBoard(
        anIdentity({ ...stranger, subject: stranger.email }),
        boardId
      )
    ).toBeNull()
  })
})
