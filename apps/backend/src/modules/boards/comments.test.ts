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

async function aTaskOf(owner: TestUser) {
  const board = (
    await api.as(owner).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<{ id: string; sections: { id: string }[] }>()
  const task = (
    await api.as(owner).post(`/boards/${board.id}/tasks`, {
      sectionId: board.sections[0]?.id,
      title: 'Logo'
    })
  ).json<{ id: string }>()
  return { boardId: board.id, taskId: task.id }
}

describe('task comments', () => {
  it('lists comments oldest first with their author', async () => {
    const alice = aUser()
    const { boardId, taskId } = await aTaskOf(alice)
    const path = `/boards/${boardId}/tasks/${taskId}/comments`

    const first = await api.as(alice).post(path, { body: 'Which palette?' })
    await api.as(alice).post(path, { body: 'The new one.' })
    const list = (await api.as(alice).get(path)).json<{
      comments: {
        id: string
        author: { userId: string; email: string }
        body: string
        createdAt: string
      }[]
    }>()

    expect(first.statusCode).toBe(201)
    expect(list.comments.map(comment => comment.body)).toEqual([
      'Which palette?',
      'The new one.'
    ])
    expect(list.comments[0]).toMatchObject({
      id: first.json<{ id: string }>().id,
      author: { userId: alice.userId, email: alice.email }
    })
  })

  it('lets viewers comment and hides comments from outsiders', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const { boardId, taskId } = await aTaskOf(alice)
    const path = `/boards/${boardId}/tasks/${taskId}/comments`
    await inTenant(db, alice, tx =>
      tx.insert(boardMembers).values({
        boardId,
        organizationId: alice.organizationId,
        userId: bob.userId,
        email: bob.email,
        role: 'viewer'
      })
    )

    expect(
      (await api.as(bob).post(path, { body: 'Looks good' })).statusCode
    ).toBe(201)
    expect((await api.as(alice).get(path)).json()).toMatchObject({
      comments: [{ author: { email: bob.email }, body: 'Looks good' }]
    })
    expect((await api.as(aUser()).get(path)).statusCode).toBe(404)
    expect((await api.as(aUser()).post(path, { body: 'Hi' })).statusCode).toBe(
      404
    )
  })

  it('counts the comments of each task on the board', async () => {
    const alice = aUser()
    const { boardId, taskId } = await aTaskOf(alice)
    const path = `/boards/${boardId}/tasks/${taskId}/comments`
    await api.as(alice).post(path, { body: 'One' })
    await api.as(alice).post(path, { body: 'Two' })

    const board = (await api.as(alice).get(`/boards/${boardId}`)).json<{
      tasks: { id: string; commentCount: number }[]
    }>()

    expect(board.tasks).toEqual([
      expect.objectContaining({ id: taskId, commentCount: 2 })
    ])
  })

  it('refuses an empty comment', async () => {
    const alice = aUser()
    const { boardId, taskId } = await aTaskOf(alice)

    const empty = await api
      .as(alice)
      .post(`/boards/${boardId}/tasks/${taskId}/comments`, { body: '  ' })

    expect(empty.statusCode).toBe(400)
  })
})
