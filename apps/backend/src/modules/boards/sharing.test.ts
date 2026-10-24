import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { userSettings } from '../settings/schema.ts'
import {
  aB2cUser,
  aBoardIn,
  aManagedProject,
  aUser,
  followersOf,
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

  it('gives the admins of a board the emails it invited, until they sign in', async () => {
    const owner = aUser()
    const editor = aUser({ organizationId: owner.organizationId })
    const guest = aUser({ organizationId: owner.organizationId })
    const boardId = await aBoardOf(owner)
    const invitedOn = async (user: TestUser) =>
      (await api.as(user).get(`/boards/${boardId}`)).json<{
        invited: string[]
      }>().invited

    await invite(owner, boardId, editor.email, 'editor')
    await boardIdsOf(editor)
    await invite(owner, boardId, guest.email, 'viewer')

    expect(await invitedOn(owner)).toEqual([guest.email])
    expect(await invitedOn(editor)).toEqual([])

    await boardIdsOf(guest)

    expect(await invitedOn(owner)).toEqual([])
  })

  it('opens the board of an invite before the guest listed their boards', async () => {
    const owner = aUser()
    const guest = aUser({ organizationId: owner.organizationId })
    const boardId = await aBoardOf(owner)
    await invite(owner, boardId, guest.email, 'viewer')

    const response = await api.as(guest).get(`/boards/${boardId}`)

    expect(response.statusCode).toBe(200)
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

  it('says who shared a board with the person, and when they joined', async () => {
    const owner = aUser({ name: 'Alice Martin' })
    const guest = aUser({ organizationId: owner.organizationId })
    const boardId = await aBoardOf(owner)
    const spaceBoard = await aBoardIn(
      db,
      guest,
      await aManagedProject(db, [[guest, 'editor']]),
      { name: 'Launch', keyPrefix: 'LCH' }
    )
    await invite(owner, boardId, guest.email, 'editor')
    const summaries = async (user: TestUser) =>
      (await api.as(user).get('/boards')).json<{
        boards: {
          id: string
          sharedBy: { name: string | null; email: string } | null
          joinedAt: string
        }[]
      }>().boards

    const guestBoards = await summaries(guest)
    const shared = guestBoards.find(board => board.id === boardId)
    const ownBoard = (await summaries(owner)).find(
      board => board.id === boardId
    )

    expect(shared?.sharedBy).toEqual({
      name: 'Alice Martin',
      email: owner.email
    })
    expect(Date.now() - Date.parse(shared?.joinedAt ?? '')).toBeLessThan(60_000)
    expect(ownBoard?.sharedBy).toBeNull()
    expect(
      guestBoards.find(board => board.id === spaceBoard)?.sharedBy
    ).toBeNull()
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

  it('keeps the sharing of an archived board as it is, but lets anyone leave', async () => {
    const owner = aUser()
    const guest = aUser({ organizationId: owner.organizationId })
    const editor = aUser({ organizationId: owner.organizationId })
    const boardId = await aBoardOf(owner)
    await invite(owner, boardId, guest.email, 'viewer')
    await invite(owner, boardId, editor.email, 'editor')
    await boardIdsOf(guest)
    await boardIdsOf(editor)
    await invite(owner, boardId, 'pending@example.com', 'viewer')
    const [pending] = (
      await api.as(owner).get(`/boards/${boardId}/sharing`)
    ).json<{ invites: { id: string }[] }>().invites
    await api.as(owner).post(`/boards/${boardId}/archive`, {})
    const member = (userId: string) => `/boards/${boardId}/members/${userId}`

    expect(
      (await invite(owner, boardId, 'late@example.com', 'viewer')).statusCode
    ).toBe(409)
    expect(
      (await api.as(owner).put(member(guest.userId), { role: 'admin' }))
        .statusCode
    ).toBe(409)
    expect(
      (
        await api
          .as(owner)
          .delete(`/boards/${boardId}/invites/${pending?.id ?? ''}`)
      ).statusCode
    ).toBe(409)
    expect((await api.as(owner).delete(member(guest.userId))).statusCode).toBe(
      409
    )
    expect(await invitesOn(owner, boardId)).toEqual([
      { email: 'pending@example.com', role: 'viewer' }
    ])
    expect(
      (await api.as(editor).delete(member(editor.userId))).statusCode
    ).toBe(204)
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

  it.each([
    { kind: 'B2B', makeUser: () => aUser() },
    { kind: 'B2C', makeUser: () => aB2cUser() }
  ])('unassigns someone who leaves ($kind)', async ({ makeUser }) => {
    const owner = makeUser()
    const guest =
      owner.organizationId === null
        ? aB2cUser()
        : aUser({ organizationId: owner.organizationId })
    const boardId = await aBoardOf(owner)
    await joinBoard(db, owner, boardId, guest, 'editor')
    const taskId = (
      await api
        .as(owner)
        .post(`/boards/${boardId}/tasks`, { sectionId: null, title: 'Logo' })
    ).json<{ id: string }>().id
    await api.as(owner).put(`/boards/${boardId}/tasks/${taskId}/assignees`, {
      userIds: [owner.userId, guest.userId]
    })

    await api.as(guest).delete(`/boards/${boardId}/members/${guest.userId}`)
    await joinBoard(db, owner, boardId, guest, 'editor')

    const [task] = (await api.as(owner).get(`/boards/${boardId}`)).json<{
      tasks: { assignees: { userId: string }[] }[]
    }>().tasks
    expect(task?.assignees.map(person => person.userId)).toEqual([owner.userId])
  })

  describe('suggestions', () => {
    const suggest = async (by: TestUser, boardId: string, q: string) => {
      const response = await api
        .as(by)
        .get(`/boards/${boardId}/sharing/people?q=${encodeURIComponent(q)}`)
      return {
        statusCode: response.statusCode,
        emails: response
          .json<{ people?: { email: string }[] }>()
          .people?.map(person => person.email)
      }
    }

    it('suggests the people of the organization by name or email, not those already in', async () => {
      const owner = aUser()
      const tag = owner.userId.slice(0, 8)
      const organizationId = owner.organizationId
      const ada = aUser({ organizationId, email: `ada-${tag}@example.com` })
      const grace = aUser({ organizationId, name: `Grace ${tag}` })
      const member = aUser({ organizationId, email: `bob-${tag}@example.com` })
      const invited = aUser({ organizationId, email: `eve-${tag}@example.com` })
      const outsider = aUser({ email: `zed-${tag}@example.com` })
      for (const user of [ada, grace, member, invited, outsider]) {
        await boardIdsOf(user)
      }
      const boardId = await aBoardOf(owner)
      await invite(owner, boardId, member.email, 'viewer')
      await boardIdsOf(member)
      await invite(owner, boardId, invited.email, 'viewer')

      expect(await suggest(owner, boardId, tag)).toEqual({
        statusCode: 200,
        emails: [ada.email, grace.email].sort()
      })
      expect((await suggest(owner, boardId, 'ADA-')).emails).toContain(
        ada.email
      )
    })

    it('matches the name chosen in settings, else the one signed in with', async () => {
      const owner = aUser()
      const tag = owner.userId.slice(0, 8)
      const organizationId = owner.organizationId
      const chosen = aUser({
        organizationId,
        email: `Linus-${randomUUID()}@Example.com`,
        name: 'Linus Old'
      })
      const signedIn = aUser({ organizationId, name: `Grace ${tag}` })
      const renamed = aUser({ organizationId, name: `Ken ${tag}` })
      for (const user of [chosen, signedIn, renamed]) await boardIdsOf(user)
      await db.insert(userSettings).values([
        { email: chosen.email.toLowerCase(), version: 1, name: `Linus ${tag}` },
        { email: signedIn.email, version: 1, language: 'fr-FR' },
        { email: renamed.email, version: 1, name: 'Ken Renamed' }
      ])
      const boardId = await aBoardOf(owner)

      expect((await suggest(owner, boardId, tag)).emails).toEqual(
        [chosen.email, signedIn.email].sort()
      )
    })

    it('keeps B2C people to those who share a project', async () => {
      const owner = aB2cUser()
      const tag = owner.userId.slice(0, 8)
      const partner = { ...aB2cUser(), email: `pal-${tag}@example.com` }
      const stranger = { ...aB2cUser(), email: `who-${tag}@example.com` }
      await boardIdsOf(stranger)
      const shared = await aBoardOf(owner)
      await invite(owner, shared, partner.email, 'viewer')
      await boardIdsOf(partner)
      const boardId = await aBoardOf(owner)

      expect((await suggest(owner, boardId, tag)).emails).toEqual([
        partner.email
      ])
    })

    it('takes a query of two characters at least, and only from an admin', async () => {
      const owner = aUser()
      const viewer = aUser({ organizationId: owner.organizationId })
      const boardId = await aBoardOf(owner)
      await invite(owner, boardId, viewer.email, 'viewer')
      await boardIdsOf(viewer)

      expect((await suggest(owner, boardId, ' a ')).statusCode).toBe(400)
      expect((await suggest(viewer, boardId, 'user')).statusCode).toBe(403)
    })

    it('reads % and _ as plain characters', async () => {
      const owner = aUser()
      await boardIdsOf(aUser({ organizationId: owner.organizationId }))
      const boardId = await aBoardOf(owner)

      expect((await suggest(owner, boardId, '%%')).emails).toEqual([])
      expect((await suggest(owner, boardId, '__')).emails).toEqual([])
    })
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
