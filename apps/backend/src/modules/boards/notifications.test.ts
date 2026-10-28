import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb, inTenant } from '../../infra/db.ts'
import {
  aB2cUser,
  aUser,
  joinBoard,
  startApp,
  type TestUser
} from '../../testing/app.ts'
import { notifications } from './schema.ts'

interface Notification {
  id: string
  reason: string
  taskId: string
  readAt: string | null
  commentExcerpt: string | null
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

async function aTeam(b2c = false) {
  const alice = b2c
    ? aB2cUser()
    : aUser({ email: 'alice@example.com', name: 'Alice Martin' })
  const bob = b2c
    ? aB2cUser()
    : aUser({ organizationId: alice.organizationId, email: 'bob@example.com' })
  const carol = b2c
    ? aB2cUser()
    : aUser({
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

  it('logs one entry and sends one notification for a task trashed with its sub-tasks', async () => {
    const { alice, bob, path, taskId, inbox } = await aTeam()
    const boardPath = path.slice(0, path.lastIndexOf('/tasks/'))
    const children: string[] = []
    for (const title of ['Sketch', 'Colors']) {
      const child = (
        await api
          .as(alice)
          .post(`${boardPath}/tasks`, { parentId: taskId, title })
      ).json<{ id: string }>()
      await api.as(alice).put(`${boardPath}/tasks/${child.id}/follow`, {})
      await api.as(bob).put(`${boardPath}/tasks/${child.id}/follow`, {})
      children.push(child.id)
    }
    await api.as(bob).put(`${path}/follow`, {})

    await api.as(alice).delete(path)

    expect(await inbox(bob)).toMatchObject([{ taskId }])
    for (const id of children) {
      const history = (
        await api.as(alice).get(`${boardPath}/tasks/${id}/history`)
      ).json<{ entries: { field: string }[] }>().entries
      expect(history.map(({ field }) => field)).toEqual(['created'])
    }
    await api.as(alice).post(`${path}/restore`, {})
    for (const id of children) {
      const history = (
        await api.as(alice).get(`${boardPath}/tasks/${id}/history`)
      ).json<{ entries: { field: string }[] }>().entries
      expect(history.map(({ field }) => field)).toEqual(['created'])
    }
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

  describe('what each notification says', () => {
    it('names who assigned the task, and on which board', async () => {
      const { alice, bob, path, inbox } = await aTeam()

      await api.as(alice).put(`${path}/assignees`, { userIds: [bob.userId] })

      expect(await inbox(bob)).toMatchObject([
        {
          reason: 'assigned',
          boardName: 'Design',
          actor: { userId: alice.userId, email: 'alice@example.com' },
          change: { field: 'assignees', to: bob.userId },
          commentExcerpt: null
        }
      ])
    })

    it('tells the person unassigned that it was them, and the other followers who it was', async () => {
      const { alice, bob, carol, path, inbox } = await aTeam()
      await api.as(carol).put(`${path}/follow`, {})
      await api.as(alice).put(`${path}/assignees`, { userIds: [bob.userId] })
      await api.as(alice).patch(path, { title: 'New logo' })
      await api.as(carol).post('/notifications/read', {})

      await api.as(alice).put(`${path}/assignees`, { userIds: [] })

      const unassigned = {
        field: 'assignees',
        from: bob.userId,
        to: null
      }
      expect(await inbox(bob)).toMatchObject([
        { reason: 'unassigned', change: unassigned },
        { reason: 'following', change: { field: 'title' } },
        { reason: 'assigned' }
      ])
      expect((await inbox(carol))[0]).toMatchObject({
        reason: 'following',
        change: unassigned
      })
    })

    it('carries the change made to a followed task, as its history logs it', async () => {
      const { alice, bob, path, inbox } = await aTeam()

      await api.as(bob).patch(path, { priority: 1 })

      expect(await inbox(alice)).toMatchObject([
        {
          reason: 'following',
          actor: { userId: bob.userId, email: 'bob@example.com' },
          change: {
            actor: { userId: bob.userId, email: 'bob@example.com' },
            field: 'priority',
            from: null,
            to: 1,
            name: null
          }
        }
      ])
    })

    it('quotes the start of the comment that mentions someone, as plain text', async () => {
      const { bob, carol, path, inbox } = await aTeam()
      const words = 'word '.repeat(40)

      await api.as(bob).post(`${path}/comments`, {
        body: `**Look** @carol@example.com ${words}`
      })

      const [mention] = await inbox(carol)
      expect(mention).toMatchObject({ reason: 'mentioned', change: null })
      expect(mention?.commentExcerpt).toBe(
        `${`Look @carol@example.com ${words}`.slice(0, 120).trimEnd()}…`
      )
    })

    it('quotes a mention as the name of the person it mentions, as the comment shows it', async () => {
      const { alice, bob, path, inbox } = await aTeam()

      await api.as(bob).post(`${path}/comments`, {
        body: 'Please review @alice@example.com and @carol@example.com'
      })

      const [mention] = await inbox(alice)
      expect(mention?.commentExcerpt).toBe(
        'Please review @Alice Martin and @carol@example.com'
      )
    })

    it('has no change once its history entry is gone', async () => {
      const { alice, bob, path, inbox } = await aTeam()
      await api.as(bob).patch(path, { priority: 1 })

      await inTenant(db, alice, tx =>
        tx
          .update(notifications)
          .set({ historyId: null })
          .where(eq(notifications.userId, alice.userId))
      )

      expect(await inbox(alice)).toMatchObject([
        { reason: 'following', actor: { userId: bob.userId }, change: null }
      ])
    })
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

  async function twoUnread() {
    const team = await aTeam()
    const boardPath = team.path.slice(0, team.path.lastIndexOf('/tasks/'))
    const other = (
      await api
        .as(team.alice)
        .post(`${boardPath}/tasks`, { sectionId: null, title: 'Colors' })
    ).json<{ id: string }>()
    await api.as(team.bob).patch(team.path, { title: 'New logo' })
    await api
      .as(team.bob)
      .patch(`${boardPath}/tasks/${other.id}`, { title: 'New colors' })
    const [newer, older] = await team.inbox(team.alice)
    if (!newer || !older) throw new Error('two notifications expected')
    const unreadIds = async () =>
      (await team.inbox(team.alice)).flatMap(({ id, readAt }) =>
        readAt === null ? [id] : []
      )
    return { ...team, newer, older, unreadIds }
  }

  it('marks one notification read, and leaves the others unread', async () => {
    const { alice, newer, older, unreadIds } = await twoUnread()

    expect(
      (await api.as(alice).post(`/notifications/${older.id}/read`, {}))
        .statusCode
    ).toBe(204)

    expect(await unreadIds()).toEqual([newer.id])
  })

  it('refuses to mark read the notification of someone else', async () => {
    const { bob, older } = await twoUnread()

    expect(
      (await api.as(bob).post(`/notifications/${older.id}/read`, {})).statusCode
    ).toBe(404)
  })

  it('marks read the notifications listed, not the ones received since', async () => {
    const { alice, newer, older, unreadIds } = await twoUnread()

    expect(
      (await api.as(alice).post('/notifications/read', { ids: [older.id] }))
        .statusCode
    ).toBe(204)

    expect(await unreadIds()).toEqual([newer.id])
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

  describe('when the person loses access to the task', () => {
    async function anAssignedBob(b2c = false) {
      const team = await aTeam(b2c)
      const boardId = team.path.split('/')[2] ?? ''
      const assignBob = () =>
        api
          .as(team.alice)
          .put(`${team.path}/assignees`, { userIds: [team.bob.userId] })
      await assignBob()
      const unread = async () =>
        (await api.as(team.bob).get('/notifications/unread')).json<{
          projects: unknown[]
        }>().projects
      return { ...team, boardId, assignBob, unread }
    }

    type Team = Awaited<ReturnType<typeof anAssignedBob>>

    async function expectAFreshStart(team: Team) {
      expect(await team.inbox(team.bob)).toEqual([])
      expect(await team.unread()).toEqual([])
      await team.assignBob()
      expect(await team.inbox(team.bob)).toMatchObject([
        { reason: 'assigned', readAt: null }
      ])
    }

    async function moveToAnotherProject(team: Team) {
      const secret = (
        await api
          .as(team.alice)
          .post('/boards', { name: 'Secret', keyPrefix: 'SEC' })
      ).json<{ id: string }>()
      await api.as(team.alice).post(`${team.path}/transfer`, {
        boardId: secret.id,
        sectionId: null
      })
      return secret.id
    }

    it('hides the notifications of a task moved out of reach', async () => {
      const team = await anAssignedBob()
      const secret = await moveToAnotherProject(team)
      await api
        .as(team.alice)
        .patch(`/boards/${secret}/tasks/${team.taskId}`, { title: 'Hidden' })

      expect(await team.inbox(team.bob)).toEqual([])
      expect(await team.unread()).toEqual([])
    })

    it('hides the notifications of a task once removed from its project', async () => {
      const team = await anAssignedBob()

      await api
        .as(team.alice)
        .delete(`/boards/${team.boardId}/members/${team.bob.userId}`)

      expect(await team.inbox(team.bob)).toEqual([])
      expect(await team.unread()).toEqual([])
    })

    it('starts afresh once a task moved out of reach comes back', async () => {
      const team = await anAssignedBob()
      const secret = await moveToAnotherProject(team)

      await api
        .as(team.alice)
        .post(`/boards/${secret}/tasks/${team.taskId}/transfer`, {
          boardId: team.boardId,
          sectionId: null
        })

      await expectAFreshStart(team)
    })

    it('starts afresh once someone removed from the project is back', async () => {
      const team = await anAssignedBob()

      await api
        .as(team.alice)
        .delete(`/boards/${team.boardId}/members/${team.bob.userId}`)
      await joinBoard(db, team.alice, team.boardId, team.bob, 'editor')

      await expectAFreshStart(team)
    })

    it.each([
      { kind: 'B2B', b2c: false },
      { kind: 'B2C', b2c: true }
    ])(
      'starts afresh once someone who left the project is back ($kind)',
      async ({ b2c }) => {
        const team = await anAssignedBob(b2c)

        await api
          .as(team.bob)
          .delete(`/boards/${team.boardId}/members/${team.bob.userId}`)
        await joinBoard(db, team.alice, team.boardId, team.bob, 'editor')

        await expectAFreshStart(team)
      }
    )

    it('starts afresh once the project a board moved to lets them in', async () => {
      const team = await anAssignedBob()
      const ops = (
        await api
          .as(team.alice)
          .post('/boards', { name: 'Ops', keyPrefix: 'OPS' })
      ).json<{ id: string; project: { id: string } }>()

      await api
        .as(team.alice)
        .post(`/boards/${team.boardId}/move`, { projectId: ops.project.id })
      await joinBoard(db, team.alice, ops.id, team.bob, 'editor')

      await expectAFreshStart(team)
    })
  })
})
