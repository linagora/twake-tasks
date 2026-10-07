import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { aUser, joinBoard, startApp, type TestUser } from '../../testing/app.ts'

interface Notification {
  id: string
  reason: string
  taskId: string
  readAt: string | null
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

async function aTeam() {
  const alice = aUser({ email: 'alice@example.com' })
  const bob = aUser({
    organizationId: alice.organizationId,
    email: 'bob@example.com'
  })
  const carol = aUser({
    organizationId: alice.organizationId,
    email: 'carol@example.com'
  })
  const board = (
    await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<{ id: string }>()
  for (const user of [bob, carol]) {
    await joinBoard(db, alice, board.id, user, 'editor')
  }
  const task = (
    await api
      .as(alice)
      .post(`/boards/${board.id}/tasks`, { sectionId: null, title: 'Logo' })
  ).json<{ id: string }>()
  const path = `/boards/${board.id}/tasks/${task.id}`
  const inbox = async (user: TestUser) =>
    (await api.as(user).get('/notifications')).json<{
      notifications: Notification[]
    }>().notifications
  const following = async (user: TestUser) =>
    (await api.as(user).get(`${path}/follow`)).json<{ following: boolean }>()
      .following
  return { alice, bob, carol, path, taskId: task.id, inbox, following }
}

describe('following and notifications', () => {
  it('has the creator follow the task, without notifying them of their own changes', async () => {
    const { alice, path, inbox, following } = await aTeam()

    await api.as(alice).patch(path, { title: 'New logo' })

    expect(await following(alice)).toBe(true)
    expect(await inbox(alice)).toEqual([])
  })

  it('notifies the creator when someone else changes the task', async () => {
    const { alice, bob, path, taskId, inbox } = await aTeam()

    await api.as(bob).patch(path, { title: 'New logo' })

    expect(await inbox(alice)).toMatchObject([
      { reason: 'following', taskId, readAt: null }
    ])
  })

  it('keeps one unread notification per task and reason', async () => {
    const { alice, bob, path, inbox } = await aTeam()

    await api.as(bob).patch(path, { title: 'New logo' })
    await api.as(bob).patch(path, { title: 'Newer logo' })

    expect(await inbox(alice)).toHaveLength(1)
  })

  it('notifies an assignee, who then follows the task', async () => {
    const { alice, bob, path, taskId, inbox, following } = await aTeam()

    await api.as(alice).put(`${path}/assignees`, { userIds: [bob.userId] })

    expect(await inbox(bob)).toMatchObject([{ reason: 'assigned', taskId }])
    expect(await following(bob)).toBe(true)
  })

  it('notifies the people mentioned in a comment, who then follow the task', async () => {
    const { alice, bob, carol, path, inbox, following } = await aTeam()

    await api.as(bob).post(`${path}/comments`, {
      body: 'What do you think @carol@example.com?'
    })

    expect(await inbox(carol)).toMatchObject([{ reason: 'mentioned' }])
    expect(await following(carol)).toBe(true)
    expect(await inbox(alice)).toMatchObject([{ reason: 'following' }])
    expect(await following(bob)).toBe(true)
  })

  it('stops notifying someone who unfollows', async () => {
    const { alice, bob, path, inbox, following } = await aTeam()

    expect((await api.as(alice).delete(`${path}/follow`)).statusCode).toBe(204)
    await api.as(bob).patch(path, { title: 'New logo' })

    expect(await following(alice)).toBe(false)
    expect(await inbox(alice)).toEqual([])
  })

  it('lets a board member follow a task', async () => {
    const { alice, carol, path, inbox } = await aTeam()

    expect((await api.as(carol).put(`${path}/follow`)).statusCode).toBe(204)
    await api.as(alice).patch(path, { title: 'New logo' })

    expect(await inbox(carol)).toMatchObject([{ reason: 'following' }])
  })

  it('marks notifications read', async () => {
    const { alice, bob, path, inbox } = await aTeam()
    await api.as(bob).patch(path, { title: 'New logo' })

    expect(
      (await api.as(alice).post('/notifications/read', {})).statusCode
    ).toBe(204)

    const [notification] = await inbox(alice)
    expect(notification?.readAt).not.toBeNull()
  })

  describe('unread counts by project', () => {
    const unread = async (user: TestUser) =>
      (await api.as(user).get('/notifications/unread')).json<{
        projects: { projectId: string; count: number }[]
      }>().projects

    async function projectOf(user: TestUser, boardId: string) {
      const { boards } = (await api.as(user).get('/boards')).json<{
        boards: { id: string; project: { id: string } }[]
      }>()
      const board = boards.find(candidate => candidate.id === boardId)
      if (!board) throw new Error(`board ${boardId} is not listed`)
      return board.project.id
    }

    async function aTask(user: TestUser, boardId: string, title: string) {
      const task = (
        await api
          .as(user)
          .post(`/boards/${boardId}/tasks`, { sectionId: null, title })
      ).json<{ id: string }>()
      return `/boards/${boardId}/tasks/${task.id}`
    }

    async function aSharedBoard(owner: TestUser, member: TestUser) {
      const board = (
        await api.as(owner).post('/boards', { name: 'Ops', keyPrefix: 'OPS' })
      ).json<{ id: string }>()
      await joinBoard(db, owner, board.id, member, 'editor')
      return board.id
    }

    it('counts the unread notifications of each project in one row', async () => {
      const { alice, bob, path } = await aTeam()
      const designId = await projectOf(alice, path.split('/')[2] ?? '')
      const opsBoard = await aSharedBoard(alice, bob)
      const opsId = await projectOf(alice, opsBoard)
      const alerts = await aTask(alice, opsBoard, 'Alerts')
      const backups = await aTask(alice, opsBoard, 'Backups')

      await api.as(bob).patch(path, { title: 'New logo' })
      await api.as(bob).patch(alerts, { title: 'New alerts' })
      await api.as(bob).patch(backups, { title: 'New backups' })

      const rows = await unread(alice)
      expect(rows).toHaveLength(2)
      expect(rows).toEqual(
        expect.arrayContaining([
          { projectId: designId, count: 1 },
          { projectId: opsId, count: 2 }
        ])
      )
    })

    it('counts past the 50 notifications of the list', async () => {
      const { alice, bob, path } = await aTeam()
      const boardId = path.split('/')[2] ?? ''
      for (let index = 0; index < 51; index++) {
        const task = await aTask(alice, boardId, `Task ${String(index)}`)
        await api.as(bob).patch(task, { title: `Renamed ${String(index)}` })
      }

      const [row] = await unread(alice)
      expect(row?.count).toBe(51)
    })

    it('leaves out a project once its notifications are read', async () => {
      const { alice, bob, path } = await aTeam()
      await api.as(bob).patch(path, { title: 'New logo' })
      expect(await unread(alice)).toHaveLength(1)

      await api.as(alice).post('/notifications/read', {})

      expect(await unread(alice)).toEqual([])
    })

    it('counts only the notifications of the person asking', async () => {
      const { bob, path } = await aTeam()
      await api.as(bob).patch(path, { title: 'New logo' })

      expect(await unread(bob)).toEqual([])
      expect(await unread(aUser())).toEqual([])
    })
  })

  it('hides a task from people outside its board', async () => {
    const { path } = await aTeam()
    const stranger = aUser()

    expect((await api.as(stranger).put(`${path}/follow`)).statusCode).toBe(404)
  })
})
