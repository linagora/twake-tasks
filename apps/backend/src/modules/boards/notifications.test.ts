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

  it('hides a task from people outside its board', async () => {
    const { path } = await aTeam()
    const stranger = aUser()

    expect((await api.as(stranger).put(`${path}/follow`)).statusCode).toBe(404)
  })
})
