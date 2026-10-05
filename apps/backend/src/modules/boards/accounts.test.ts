import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import type { PlatformEvent } from '../../events/envelope.ts'
import { RejectedEventError } from '../../events/router.ts'
import { asTenant, createDb, inTenant } from '../../infra/db.ts'
import { aB2cUser, aUser, startApp, type TestUser } from '../../testing/app.ts'
import { accountRoutes } from './accounts.ts'
import { boardMembers, boards } from './schema.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

function deliver(routingKey: string, body: object) {
  const handler = accountRoutes.get(routingKey)
  if (!handler) throw new Error(`no handler for ${routingKey}`)
  const event: PlatformEvent = { routingKey, messageId: randomUUID(), body }
  return db.transaction(tx => handler(event, tx))
}

interface Board {
  id: string
  name: string
  role: string
  inbox: boolean
}

const boardsOf = async (user: TestUser) =>
  (await api.as(user).get('/boards')).json<{ boards: Board[] }>().boards

async function aBoard(
  owner: TestUser,
  name: string,
  members: [TestUser, 'viewer' | 'editor' | 'admin'][]
) {
  const board = (
    await api.as(owner).post('/boards', {
      name,
      keyPrefix: name.toUpperCase().slice(0, 3)
    })
  ).json<{ id: string }>()
  for (const [user, role] of members) {
    await inTenant(db, owner, tx =>
      tx.insert(boardMembers).values({
        boardId: board.id,
        organizationId: owner.organizationId,
        userId: user.userId,
        email: user.email,
        role
      })
    )
  }
  const task = (
    await api
      .as(owner)
      .post(`/boards/${board.id}/tasks`, { sectionId: null, title: 'Logo' })
  ).json<{ id: string }>()
  await api.as(owner).put(`/boards/${board.id}/tasks/${task.id}/assignees`, {
    userIds: [owner.userId, ...members.map(([user]) => user.userId)]
  })
  const assignees = async (viewer: TestUser) =>
    (await api.as(viewer).get(`/boards/${board.id}`))
      .json<{ tasks: { assignees: { userId: string }[] }[] }>()
      .tasks[0]?.assignees.map(person => person.userId)
  return { id: board.id, assignees }
}

async function inboxesOf(user: TestUser) {
  return db.transaction(async tx => {
    await asTenant(tx, user)
    return tx
      .select({ id: boards.id })
      .from(boards)
      .where(and(eq(boards.inbox, true), eq(boards.ownerId, user.userId)))
  })
}

describe.each([
  {
    kind: 'B2B, matched by email',
    routingKey: 'domain.user.deleted',
    makeUser: () => aUser(),
    body: (user: TestUser) => ({
      organizationId: user.organizationId,
      internalEmail: user.email
    })
  },
  {
    kind: 'B2B, matched by uuid',
    routingKey: 'domain.user.deleted',
    makeUser: () => aUser(),
    body: (user: TestUser) => ({
      organizationId: user.organizationId,
      uuid: user.userId
    })
  },
  {
    kind: 'B2C',
    routingKey: 'user.deleted',
    makeUser: () => aB2cUser(),
    body: (user: TestUser) => ({ uuid: user.userId })
  }
])('a deleted account ($kind)', ({ routingKey, makeUser, body }) => {
  it('leaves its boards, hands them on or deletes them, and loses its Inbox', async () => {
    const gone = makeUser()
    const peer = (): TestUser =>
      gone.organizationId
        ? aUser({ organizationId: gone.organizationId })
        : aB2cUser()
    const firstEditor = peer()
    const laterEditor = peer()
    const viewer = peer()
    await boardsOf(gone)
    const handedOn = await aBoard(gone, 'Home', [
      [firstEditor, 'editor'],
      [laterEditor, 'editor']
    ])
    await aBoard(gone, 'Solo', [[viewer, 'viewer']])

    await deliver(routingKey, body(gone))

    expect((await boardsOf(firstEditor)).filter(board => !board.inbox)).toEqual(
      [expect.objectContaining({ name: 'Home', role: 'admin' })]
    )
    expect((await boardsOf(laterEditor)).filter(board => !board.inbox)).toEqual(
      [expect.objectContaining({ name: 'Home', role: 'editor' })]
    )
    expect((await boardsOf(viewer)).filter(board => !board.inbox)).toEqual([])
    expect(await handedOn.assignees(firstEditor)).toEqual(
      expect.not.arrayContaining([gone.userId])
    )
    expect(await inboxesOf(gone)).toEqual([])
  })
})

describe('deleted accounts that cannot be applied', () => {
  it('rejects a B2B deletion without an organization', async () => {
    await expect(
      deliver('domain.user.deleted', { internalEmail: 'a@example.com' })
    ).rejects.toThrow(RejectedEventError)
  })

  it('rejects a B2C deletion without a uuid', async () => {
    await expect(
      deliver('user.deleted', { email: 'a@example.com' })
    ).rejects.toThrow(RejectedEventError)
  })
})
