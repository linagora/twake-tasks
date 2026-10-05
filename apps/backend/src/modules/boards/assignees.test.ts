import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb, inTenant } from '../../infra/db.ts'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'
import { spaceMembers, spaces } from '../spaces/schema.ts'
import { boardMembers, boards } from './schema.ts'

interface Person {
  userId: string
  email: string
}

interface Board {
  id: string
  members: Person[]
  sections: { id: string }[]
  tasks: { id: string; assignees: Person[] }[]
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

const person = (user: TestUser): Person => ({
  userId: user.userId,
  email: user.email
})

async function aSharedTask(
  alice: TestUser,
  bob: TestUser,
  role: 'viewer' | 'editor'
) {
  const board = (
    await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<Board>()
  await inTenant(db, alice, tx =>
    tx.insert(boardMembers).values({
      boardId: board.id,
      organizationId: alice.organizationId,
      userId: bob.userId,
      email: bob.email,
      role
    })
  )
  const task = (
    await api.as(alice).post(`/boards/${board.id}/tasks`, {
      sectionId: board.sections[0]?.id,
      title: 'Logo'
    })
  ).json<{ id: string }>()
  const assign = (user: TestUser, userIds: string[]) =>
    api
      .as(user)
      .put(`/boards/${board.id}/tasks/${task.id}/assignees`, { userIds })
  const load = async () =>
    (await api.as(alice).get(`/boards/${board.id}`)).json<Board>()
  return { assign, load }
}

describe('assignees', () => {
  it('assigns board members and lists them on the task', async () => {
    const alice = aUser({ email: 'alice@example.com' })
    const bob = aUser({
      organizationId: alice.organizationId,
      email: 'bob@example.com'
    })
    const { assign, load } = await aSharedTask(alice, bob, 'editor')

    const assigned = await assign(bob, [bob.userId, alice.userId])
    const board = await load()
    const cleared = await assign(alice, [])

    expect(assigned.statusCode).toBe(204)
    expect(board.members).toEqual([person(alice), person(bob)])
    expect(board.tasks[0]?.assignees).toEqual([person(alice), person(bob)])
    expect(cleared.statusCode).toBe(204)
    expect((await load()).tasks[0]?.assignees).toEqual([])
  })

  it('assigns only members, and only for editors', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const outsider = aUser({ organizationId: alice.organizationId })
    const { assign, load } = await aSharedTask(alice, bob, 'viewer')

    const stranger = await assign(alice, [outsider.userId])
    const byViewer = await assign(bob, [bob.userId])

    expect(stranger.statusCode).toBe(400)
    expect(stranger.json()).toEqual({ error: 'invalid_assignee' })
    expect(byViewer.statusCode).toBe(403)
    expect((await load()).tasks[0]?.assignees).toEqual([])
  })

  it('assigns a repeated member once, and hides a member who left', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const { assign, load } = await aSharedTask(alice, bob, 'editor')

    const repeated = await assign(alice, [bob.userId, bob.userId])
    const assigned = (await load()).tasks[0]?.assignees
    await inTenant(db, alice, tx =>
      tx.delete(boardMembers).where(eq(boardMembers.userId, bob.userId))
    )
    const board = await load()

    expect(repeated.statusCode).toBe(204)
    expect(assigned).toEqual([person(bob)])
    expect(board.members).toEqual([person(alice)])
    expect(board.tasks[0]?.assignees).toEqual([])
  })

  it('assigns the members of a space board', async () => {
    const alice = aUser({ email: 'alice@example.com' })
    const carol = aUser({
      organizationId: alice.organizationId,
      email: 'carol@example.com'
    })
    const bob = aUser({ organizationId: alice.organizationId })
    const spaceId = randomUUID()
    const boardId = await inTenant(db, alice, async tx => {
      await tx.insert(spaces).values({
        id: spaceId,
        organizationId: alice.organizationId ?? '',
        name: 'Marketing'
      })
      await tx.insert(spaceMembers).values(
        [alice, carol].map(user => ({
          spaceId,
          organizationId: alice.organizationId ?? '',
          userId: user.userId,
          email: user.email,
          role: user === alice ? ('editor' as const) : ('viewer' as const)
        }))
      )
      const [board] = await tx
        .insert(boards)
        .values({
          organizationId: alice.organizationId,
          spaceId,
          name: 'Launch',
          keyPrefix: 'LCH',
          createdBy: alice.userId
        })
        .returning({ id: boards.id })
      return board?.id ?? ''
    })
    const task = (
      await api
        .as(alice)
        .post(`/boards/${boardId}/tasks`, { sectionId: null, title: 'Teaser' })
    ).json<{ id: string }>()
    const assign = (userIds: string[]) =>
      api
        .as(alice)
        .put(`/boards/${boardId}/tasks/${task.id}/assignees`, { userIds })

    const outsider = await assign([bob.userId])
    const assigned = await assign([carol.userId])
    const board = (await api.as(alice).get(`/boards/${boardId}`)).json<Board>()
    await inTenant(db, alice, tx =>
      tx
        .delete(spaceMembers)
        .where(
          and(
            eq(spaceMembers.spaceId, spaceId),
            eq(spaceMembers.userId, carol.userId)
          )
        )
    )
    const left = (await api.as(alice).get(`/boards/${boardId}`)).json<Board>()

    expect(outsider.statusCode).toBe(400)
    expect(assigned.statusCode).toBe(204)
    expect(board.members).toEqual([person(alice), person(carol)])
    expect(board.tasks[0]?.assignees).toEqual([person(carol)])
    expect(left.tasks[0]?.assignees).toEqual([])
  })
})
