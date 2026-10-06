import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import {
  aBoardIn,
  aManagedProject,
  aUser,
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

interface Board {
  id: string
  role: string
  project: { id: string; name: string; personal: boolean; managed: boolean }
  labels: { id: string }[]
  tasks: { id: string; key: string; labels: object[]; assignees: object[] }[]
}

async function aBoardWithATask(owner: TestUser, keyPrefix = 'DES') {
  const board = (
    await api.as(owner).post('/boards', { name: 'Design', keyPrefix })
  ).json<Board>()
  const task = (
    await api
      .as(owner)
      .post(`/boards/${board.id}/tasks`, { sectionId: null, title: 'Logo' })
  ).json<{ id: string }>()
  return { boardId: board.id, projectId: board.project.id, taskId: task.id }
}

const move = (user: TestUser, boardId: string, projectId: string) =>
  api.as(user).post(`/boards/${boardId}/move`, { projectId })

const boardOf = async (user: TestUser, boardId: string) =>
  (await api.as(user).get(`/boards/${boardId}`)).json<Board>()

const roleOf = async (user: TestUser, boardId: string) =>
  (await api.as(user).get('/boards'))
    .json<{ boards: { id: string; role: string }[] }>()
    .boards.find(board => board.id === boardId)?.role

describe('moving a board to another project', () => {
  it('takes the target project members and keeps task keys', async () => {
    const owner = aUser()
    const guest = aUser({ organizationId: owner.organizationId })
    const colleague = aUser({ organizationId: owner.organizationId })
    const { boardId } = await aBoardWithATask(owner)
    await api
      .as(owner)
      .post(`/boards/${boardId}/invites`, { email: guest.email, role: 'admin' })
    await roleOf(guest, boardId)
    const projectId = await aManagedProject(db, [
      [owner, 'editor'],
      [colleague, 'viewer']
    ])

    const response = await move(owner, boardId, projectId)

    expect(response.statusCode).toBe(204)
    expect(await boardOf(owner, boardId)).toMatchObject({
      project: { id: projectId, managed: true, personal: false },
      role: 'editor',
      tasks: [{ key: 'DES-1' }]
    })
    expect(await roleOf(colleague, boardId)).toBe('viewer')
    expect(await roleOf(guest, boardId)).toBeUndefined()
  })

  it('drops the labels and the assignees the target project does not have', async () => {
    const owner = aUser()
    const guest = aUser({ organizationId: owner.organizationId })
    const { boardId, taskId } = await aBoardWithATask(owner)
    await api.as(owner).post(`/boards/${boardId}/invites`, {
      email: guest.email,
      role: 'editor'
    })
    await roleOf(guest, boardId)
    const label = (
      await api.as(owner).post(`/boards/${boardId}/labels`, { name: 'Urgent' })
    ).json<{ id: string }>()
    const task = `/boards/${boardId}/tasks/${taskId}`
    await api.as(owner).put(`${task}/labels`, { labelIds: [label.id] })
    await api
      .as(owner)
      .put(`${task}/assignees`, { userIds: [owner.userId, guest.userId] })
    const target = await aBoardWithATask(owner, 'OPS')

    expect((await move(owner, boardId, target.projectId)).statusCode).toBe(204)

    const moved = await boardOf(owner, boardId)
    expect(moved.labels).toEqual([])
    expect(moved.tasks[0]?.labels).toEqual([])
    expect(moved.tasks[0]?.assignees).toMatchObject([{ userId: owner.userId }])
  })

  it('lists the projects I belong to, with my role', async () => {
    const me = aUser()
    const projectId = await aManagedProject(db, [[me, 'editor']])
    await aManagedProject(db, [
      [aUser({ organizationId: me.organizationId }), 'admin']
    ])

    expect((await api.as(me).get('/projects')).json()).toEqual({
      projects: [
        {
          id: projectId,
          name: 'Marketing',
          personal: false,
          managed: true,
          role: 'editor'
        }
      ]
    })
  })

  it('needs board admin and target project editor', async () => {
    const owner = aUser()
    const { boardId } = await aBoardWithATask(owner)
    const viewerOf = await aManagedProject(db, [[owner, 'viewer']])
    const otherOrg = await aManagedProject(db, [[aUser(), 'admin']])

    expect((await move(owner, boardId, viewerOf)).statusCode).toBe(403)
    expect((await move(owner, boardId, otherOrg)).statusCode).toBe(404)
  })

  it('refuses a key prefix the target already uses, and the Inbox', async () => {
    const owner = aUser()
    const { boardId } = await aBoardWithATask(owner)
    const projectId = await aManagedProject(db, [[owner, 'admin']])
    await aBoardIn(db, owner, projectId, { name: 'Existing', keyPrefix: 'DES' })
    const inbox = (await api.as(owner).get('/boards'))
      .json<{ boards: { id: string; inbox: boolean }[] }>()
      .boards.find(board => board.inbox)

    expect((await move(owner, boardId, projectId)).json()).toEqual({
      error: 'key_prefix_taken'
    })
    expect((await move(owner, inbox?.id ?? '', projectId)).statusCode).toBe(403)
  })
})

describe('creating a board in a project', () => {
  it('puts a new board in a new project named after it', async () => {
    const owner = aUser()

    const board = (
      await api.as(owner).post('/boards', { name: 'Design', keyPrefix: 'DES' })
    ).json<Board>()

    expect(board.project).toMatchObject({
      name: 'Design',
      personal: false,
      managed: false
    })
  })

  it('adds a board to a project I administer, refusing a taken prefix', async () => {
    const owner = aUser()
    const editor = aUser({ organizationId: owner.organizationId })
    const { projectId } = await aBoardWithATask(owner)
    const create = (user: TestUser, keyPrefix: string) =>
      api.as(user).post('/boards', { name: 'Ops', keyPrefix, projectId })

    const added = await create(owner, 'OPS')
    const clash = await create(owner, 'DES')
    const managed = await aManagedProject(db, [[editor, 'editor']])
    const byEditor = await api
      .as(editor)
      .post('/boards', { name: 'Ops', keyPrefix: 'OPS', projectId: managed })

    expect(added.statusCode).toBe(201)
    expect(added.json<Board>().project.id).toBe(projectId)
    expect(clash.json()).toEqual({ error: 'key_prefix_taken' })
    expect(byEditor.statusCode).toBe(403)
  })
})
