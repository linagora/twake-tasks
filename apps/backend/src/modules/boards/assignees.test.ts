import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb, inTenant } from '../../infra/db.ts'
import {
  aBoardIn,
  aManagedProject,
  aUser,
  joinBoard,
  startApp,
  type TestUser
} from '../../testing/app.ts'
import { projectMembers } from './schema.ts'

interface Person {
  userId: string
  email: string
  name: string | null
  avatar: string | null
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
  email: user.email,
  name: null,
  avatar: null
})

async function aSharedTask(
  alice: TestUser,
  bob: TestUser,
  role: 'viewer' | 'editor'
) {
  const board = (
    await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<Board>()
  await joinBoard(db, alice, board.id, bob, role)
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
      tx.delete(projectMembers).where(eq(projectMembers.userId, bob.userId))
    )
    const board = await load()

    expect(repeated.statusCode).toBe(204)
    expect(assigned).toEqual([person(bob)])
    expect(board.members).toEqual([person(alice)])
    expect(board.tasks[0]?.assignees).toEqual([])
  })

  it('assigns the members of a managed project', async () => {
    const alice = aUser({ email: 'alice@example.com' })
    const carol = aUser({
      organizationId: alice.organizationId,
      email: 'carol@example.com'
    })
    const bob = aUser({ organizationId: alice.organizationId })
    const projectId = await aManagedProject(db, [
      [alice, 'editor'],
      [carol, 'viewer']
    ])
    const boardId = await aBoardIn(db, alice, projectId, {
      name: 'Launch',
      keyPrefix: 'LCH'
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
        .delete(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, carol.userId)
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
