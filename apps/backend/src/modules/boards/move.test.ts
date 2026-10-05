import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb, inTenant } from '../../infra/db.ts'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'
import { spaceMembers, spaces } from '../spaces/schema.ts'
import { boards } from './schema.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

async function aSpace(
  members: [TestUser, 'viewer' | 'editor' | 'admin'][],
  boardPrefix?: string
) {
  const [first] = members
  if (!first) throw new Error('a space needs a member')
  const organizationId = first[0].organizationId ?? ''
  const spaceId = randomUUID()
  await inTenant(db, first[0], async tx => {
    await tx.insert(spaces).values({ id: spaceId, organizationId, name: 'Ops' })
    await tx.insert(spaceMembers).values(
      members.map(([user, role]) => ({
        spaceId,
        organizationId,
        userId: user.userId,
        email: user.email,
        role
      }))
    )
    if (boardPrefix) {
      await tx.insert(boards).values({
        organizationId,
        spaceId,
        name: 'Existing',
        keyPrefix: boardPrefix,
        createdBy: first[0].userId
      })
    }
  })
  return spaceId
}

async function aBoardWithATask(owner: TestUser) {
  const board = (
    await api.as(owner).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<{ id: string }>()
  await api
    .as(owner)
    .post(`/boards/${board.id}/tasks`, { sectionId: null, title: 'Logo' })
  return board.id
}

const roleOf = async (user: TestUser, boardId: string) =>
  (await api.as(user).get('/boards'))
    .json<{ boards: { id: string; role: string }[] }>()
    .boards.find(board => board.id === boardId)?.role

describe('moving a board into a space', () => {
  it('drops its members, applies the space roles and keeps task keys', async () => {
    const owner = aUser()
    const guest = aUser({ organizationId: owner.organizationId })
    const colleague = aUser({ organizationId: owner.organizationId })
    const boardId = await aBoardWithATask(owner)
    await api
      .as(owner)
      .post(`/boards/${boardId}/invites`, { email: guest.email, role: 'admin' })
    await roleOf(guest, boardId)
    const spaceId = await aSpace([
      [owner, 'editor'],
      [colleague, 'viewer']
    ])

    const response = await api
      .as(owner)
      .post(`/boards/${boardId}/move`, { spaceId })

    expect(response.statusCode).toBe(204)
    const board = (await api.as(owner).get(`/boards/${boardId}`)).json<{
      spaceId: string
      role: string
      tasks: { key: string }[]
    }>()
    expect(board).toMatchObject({
      spaceId,
      role: 'editor',
      tasks: [{ key: 'DES-1' }]
    })
    expect(await roleOf(colleague, boardId)).toBe('viewer')
    expect(await roleOf(guest, boardId)).toBeUndefined()
  })

  it('lists the spaces I belong to, with my role', async () => {
    const me = aUser()
    const spaceId = await aSpace([[me, 'editor']])
    await aSpace([[aUser({ organizationId: me.organizationId }), 'admin']])

    expect((await api.as(me).get('/spaces')).json()).toEqual({
      spaces: [{ id: spaceId, name: 'Ops', role: 'editor' }]
    })
  })

  it('needs board admin and space editor', async () => {
    const owner = aUser()
    const boardId = await aBoardWithATask(owner)
    const viewerSpace = await aSpace([[owner, 'viewer']])
    const otherOrg = await aSpace([[aUser(), 'admin']])

    expect(
      (
        await api
          .as(owner)
          .post(`/boards/${boardId}/move`, { spaceId: viewerSpace })
      ).statusCode
    ).toBe(403)
    expect(
      (
        await api
          .as(owner)
          .post(`/boards/${boardId}/move`, { spaceId: otherOrg })
      ).statusCode
    ).toBe(404)
  })

  it('refuses a key prefix the space already uses, and the Inbox', async () => {
    const owner = aUser()
    const boardId = await aBoardWithATask(owner)
    const spaceId = await aSpace([[owner, 'admin']], 'DES')
    const inbox = (await api.as(owner).get('/boards'))
      .json<{ boards: { id: string; inbox: boolean }[] }>()
      .boards.find(board => board.inbox)

    expect(
      (await api.as(owner).post(`/boards/${boardId}/move`, { spaceId })).json()
    ).toEqual({ error: 'key_prefix_taken' })
    expect(
      (await api.as(owner).post(`/boards/${inbox?.id ?? ''}/move`, { spaceId }))
        .statusCode
    ).toBe(403)
  })
})
