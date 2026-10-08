import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import {
  aB2cUser,
  aBoardIn,
  aManagedProject,
  aUser,
  followersOf,
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

async function aBoardOf(owner: TestUser) {
  return (
    await api.as(owner).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<{ id: string }>().id
}

const invite = (by: TestUser, boardId: string, email: string, role: string) =>
  api.as(by).post(`/boards/${boardId}/invites`, { email, role })

const boardIdsOf = async (user: TestUser) =>
  (await api.as(user).get('/boards'))
    .json<{ boards: { id: string; role: string }[] }>()
    .boards.map(board => ({ id: board.id, role: board.role }))

const invitesOn = async (user: TestUser, boardId: string) =>
  (await api.as(user).get(`/boards/${boardId}/sharing`))
    .json<{ invites: { email: string; role: string }[] }>()
    .invites.map(({ email, role }) => ({ email, role }))

describe('sharing a board', () => {
  it('turns an invite into a membership when that email signs in', async () => {
    const owner = aUser()
    const guest = aUser({ organizationId: owner.organizationId })
    const boardId = await aBoardOf(owner)

    const response = await invite(
      owner,
      boardId,
      guest.email.toUpperCase(),
      'editor'
    )

    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({ status: 'invited' })
    expect(await invitesOn(owner, boardId)).toEqual([
      { email: guest.email, role: 'editor' }
    ])

    expect(await boardIdsOf(guest)).toContainEqual({
      id: boardId,
      role: 'editor'
    })
    expect(await invitesOn(owner, boardId)).toEqual([])
  })

  it('answers invited for an unknown email too', async () => {
    const owner = aUser()
    const boardId = await aBoardOf(owner)

    const response = await invite(
      owner,
      boardId,
      'nobody@example.com',
      'viewer'
    )

    expect(response.statusCode).toBe(202)
  })

  it('keeps invites inside the organization, and B2C apart from B2B', async () => {
    const owner = aUser()
    const sameEmailElsewhere = aUser({ email: `x-${owner.userId}@example.com` })
    const b2c = aB2cUser()
    const b2cGuest = { ...aB2cUser(), email: `b-${owner.userId}@example.com` }
    const boardId = await aBoardOf(owner)
    const b2cBoardId = await aBoardOf(b2c)

    await invite(owner, boardId, sameEmailElsewhere.email, 'editor')
    await invite(b2c, b2cBoardId, b2cGuest.email, 'viewer')

    expect(await boardIdsOf(sameEmailElsewhere)).not.toContainEqual(
      expect.objectContaining({ id: boardId })
    )
    expect(await boardIdsOf(b2cGuest)).toContainEqual({
      id: b2cBoardId,
      role: 'viewer'
    })
  })

  it('lets only admins share, and never the Inbox', async () => {
    const owner = aUser()
    const viewer = aUser({ organizationId: owner.organizationId })
    const boardId = await aBoardOf(owner)
    await invite(owner, boardId, viewer.email, 'viewer')
    await boardIdsOf(viewer)
    const inbox = (await api.as(owner).get('/boards'))
      .json<{ boards: { id: string; inbox: boolean }[] }>()
      .boards.find(board => board.inbox)

    expect(
      (await invite(viewer, boardId, 'x@example.com', 'viewer')).statusCode
    ).toBe(403)
    expect(
      (await invite(owner, inbox?.id ?? '', 'x@example.com', 'viewer'))
        .statusCode
    ).toBe(403)
  })

  it('leaves the members of a managed project to its integration', async () => {
    const admin = aUser()
    const projectId = await aManagedProject(db, [[admin, 'admin']])
    const boardId = await aBoardIn(db, admin, projectId, {
      name: 'Launch',
      keyPrefix: 'LCH'
    })

    expect(
      (await invite(admin, boardId, 'x@example.com', 'viewer')).statusCode
    ).toBe(403)
  })

  it('shares every board of the project', async () => {
    const owner = aUser()
    const guest = aUser({ organizationId: owner.organizationId })
    const { id: boardId, project } = (
      await api.as(owner).post('/boards', { name: 'Design', keyPrefix: 'DES' })
    ).json<{ id: string; project: { id: string } }>()
    const sibling = (
      await api.as(owner).post('/boards', {
        name: 'Ops',
        keyPrefix: 'OPS',
        projectId: project.id
      })
    ).json<{ id: string }>().id

    await invite(owner, boardId, guest.email, 'editor')

    expect(await boardIdsOf(guest)).toEqual(
      expect.arrayContaining([
        { id: boardId, role: 'editor' },
        { id: sibling, role: 'editor' }
      ])
    )
  })

  it('changes a role and removes a member, keeping an admin', async () => {
    const owner = aUser()
    const guest = aUser({ organizationId: owner.organizationId })
    const boardId = await aBoardOf(owner)
    await invite(owner, boardId, guest.email, 'viewer')
    await boardIdsOf(guest)
    const member = (userId: string) => `/boards/${boardId}/members/${userId}`

    expect(
      (await api.as(owner).put(member(guest.userId), { role: 'admin' }))
        .statusCode
    ).toBe(204)
    expect(
      (await api.as(owner).get(`/boards/${boardId}/sharing`)).json<{
        members: unknown[]
      }>().members
    ).toEqual(
      [
        { userId: owner.userId, email: owner.email, role: 'admin' },
        { userId: guest.userId, email: guest.email, role: 'admin' }
      ]
        .map(member => ({ ...member, name: null, avatar: null }))
        .sort((a, b) => a.email.localeCompare(b.email))
    )

    expect((await api.as(guest).delete(member(owner.userId))).statusCode).toBe(
      204
    )
    expect(
      (await api.as(guest).put(member(guest.userId), { role: 'editor' }))
        .statusCode
    ).toBe(409)
    expect((await api.as(guest).delete(member(guest.userId))).statusCode).toBe(
      409
    )
    expect(await boardIdsOf(owner)).not.toContainEqual(
      expect.objectContaining({ id: boardId })
    )
  })

  it('lets anyone leave a board', async () => {
    const owner = aUser()
    const guest = aUser({ organizationId: owner.organizationId })
    const boardId = await aBoardOf(owner)
    await invite(owner, boardId, guest.email, 'viewer')
    await boardIdsOf(guest)

    expect(
      (await api.as(guest).delete(`/boards/${boardId}/members/${guest.userId}`))
        .statusCode
    ).toBe(204)
    expect(await boardIdsOf(guest)).not.toContainEqual(
      expect.objectContaining({ id: boardId })
    )
  })

  describe('followers', () => {
    async function aFollowedTask() {
      const owner = aUser()
      const guest = aUser({ organizationId: owner.organizationId })
      const boardId = await aBoardOf(owner)
      await invite(owner, boardId, guest.email, 'editor')
      await boardIdsOf(guest)
      const taskId = (
        await api
          .as(owner)
          .post(`/boards/${boardId}/tasks`, { sectionId: null, title: 'Logo' })
      ).json<{ id: string }>().id
      await api.as(guest).put(`/boards/${boardId}/tasks/${taskId}/follow`)
      return { owner, guest, boardId, taskId }
    }

    it('stops someone who leaves following the tasks', async () => {
      const { owner, guest, boardId, taskId } = await aFollowedTask()

      await api.as(guest).delete(`/boards/${boardId}/members/${guest.userId}`)

      expect(await followersOf(db, owner, taskId)).toEqual([owner.userId])
    })

    it('stops someone an admin removes following the tasks', async () => {
      const { owner, guest, boardId, taskId } = await aFollowedTask()

      await api.as(owner).delete(`/boards/${boardId}/members/${guest.userId}`)

      expect(await followersOf(db, owner, taskId)).toEqual([owner.userId])
    })

    it('keeps only the followers who are members of the project a board moves to', async () => {
      const { owner, guest, boardId, taskId } = await aFollowedTask()
      const carol = aUser({ organizationId: owner.organizationId })
      const other = (
        await api.as(owner).post('/boards', { name: 'Ops', keyPrefix: 'OPS' })
      ).json<{ id: string; project: { id: string } }>()
      await invite(owner, boardId, carol.email, 'editor')
      await invite(owner, other.id, carol.email, 'editor')
      await boardIdsOf(carol)
      await api.as(carol).put(`/boards/${boardId}/tasks/${taskId}/follow`)

      await api
        .as(owner)
        .post(`/boards/${boardId}/move`, { projectId: other.project.id })

      expect(await followersOf(db, owner, taskId)).toEqual(
        [owner.userId, carol.userId].sort()
      )
      expect(await followersOf(db, owner, taskId)).not.toContain(guest.userId)
    })
  })
})
