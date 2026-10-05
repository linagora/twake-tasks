import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb, inTenant } from '../../infra/db.ts'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'
import { boardMembers } from './schema.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

interface Entry {
  actor: { userId: string; email: string }
  field: string
  from: unknown
  to: unknown
  at: string
}

async function aBoardOf(owner: TestUser) {
  return (
    await api.as(owner).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<{ id: string; sections: { id: string }[] }>()
}

async function historyOf(user: TestUser, boardId: string, taskId: string) {
  const response = await api
    .as(user)
    .get(`/boards/${boardId}/tasks/${taskId}/history`)
  return response.json<{ entries: Entry[] }>().entries
}

describe('task history', () => {
  it('lists each change with who made it, newest first', async () => {
    const alice = aUser()
    const board = await aBoardOf(alice)
    const [todo, doing] = board.sections
    const task = (
      await api.as(alice).post(`/boards/${board.id}/tasks`, {
        sectionId: todo?.id,
        title: 'Logo'
      })
    ).json<{ id: string }>()
    await api.as(alice).patch(`/boards/${board.id}/tasks/${task.id}`, {
      title: 'New logo',
      priority: 2
    })
    await api.as(alice).post(`/boards/${board.id}/tasks/${task.id}/move`, {
      sectionId: doing?.id
    })

    const entries = await historyOf(alice, board.id, task.id)

    expect(entries.map(({ field, from, to }) => ({ field, from, to }))).toEqual(
      [
        { field: 'section', from: todo?.id, to: doing?.id },
        { field: 'priority', from: null, to: 2 },
        { field: 'title', from: 'Logo', to: 'New logo' },
        { field: 'created', from: null, to: 'Logo' }
      ]
    )
    expect(entries[0]?.actor).toEqual({
      userId: alice.userId,
      email: alice.email
    })
  })

  it('records only the assignees that changed', async () => {
    const alice = aUser()
    const board = await aBoardOf(alice)
    const task = (
      await api.as(alice).post(`/boards/${board.id}/tasks`, {
        sectionId: board.sections[0]?.id,
        title: 'Logo'
      })
    ).json<{ id: string }>()
    const path = `/boards/${board.id}/tasks/${task.id}/assignees`
    await api.as(alice).put(path, { userIds: [alice.userId] })
    await api.as(alice).put(path, { userIds: [alice.userId] })
    await api.as(alice).put(path, { userIds: [] })

    const entries = await historyOf(alice, board.id, task.id)

    expect(
      entries
        .filter(entry => entry.field === 'assignees')
        .map(({ from, to }) => ({ from, to }))
    ).toEqual([
      { from: alice.userId, to: null },
      { from: null, to: alice.userId }
    ])
  })

  it('records sub-tasks completed along with their parent', async () => {
    const alice = aUser()
    const board = (
      await api.as(alice).post('/boards', { name: 'Inbox', keyPrefix: 'IN' })
    ).json<{ id: string }>()
    const parent = (
      await api
        .as(alice)
        .post(`/boards/${board.id}/tasks`, { sectionId: null, title: 'Trip' })
    ).json<{ id: string }>()
    const child = (
      await api.as(alice).post(`/boards/${board.id}/tasks`, {
        parentId: parent.id,
        title: 'Bags'
      })
    ).json<{ id: string }>()
    await api
      .as(alice)
      .post(`/boards/${board.id}/tasks/${parent.id}/complete`, {
        state: 'completed'
      })

    const [latest] = await historyOf(alice, board.id, child.id)

    expect(latest).toMatchObject({
      field: 'completion',
      from: null,
      to: 'completed',
      actor: { userId: alice.userId }
    })
  })

  it('shows the history to viewers and hides it from outsiders', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const board = await aBoardOf(alice)
    const task = (
      await api.as(alice).post(`/boards/${board.id}/tasks`, {
        sectionId: board.sections[0]?.id,
        title: 'Logo'
      })
    ).json<{ id: string }>()
    await inTenant(db, alice, tx =>
      tx.insert(boardMembers).values({
        boardId: board.id,
        organizationId: alice.organizationId,
        userId: bob.userId,
        email: bob.email,
        role: 'viewer'
      })
    )
    const path = `/boards/${board.id}/tasks/${task.id}/history`

    expect((await api.as(bob).get(path)).statusCode).toBe(200)
    expect((await api.as(aUser()).get(path)).statusCode).toBe(404)
  })
})
