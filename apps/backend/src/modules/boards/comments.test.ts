import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { aUser, joinBoard, startApp, type TestUser } from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

async function aTaskOf(owner: TestUser, keyPrefix = 'DES') {
  const board = (
    await api.as(owner).post('/boards', { name: 'Design', keyPrefix })
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
    await joinBoard(db, alice, boardId, bob, 'viewer')

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

  it('refuses a comment on an archived board but still lists the old ones', async () => {
    const alice = aUser()
    const { boardId, taskId } = await aTaskOf(alice)
    const path = `/boards/${boardId}/tasks/${taskId}/comments`
    await api.as(alice).post(path, { body: 'Before' })
    await api.as(alice).post(`/boards/${boardId}/archive`, {})

    expect((await api.as(alice).post(path, { body: 'After' })).statusCode).toBe(
      409
    )
    expect(
      (await api.as(alice).get(path))
        .json<{ comments: { body: string }[] }>()
        .comments.map(comment => comment.body)
    ).toEqual(['Before'])
  })

  it('refuses a comment on an archived or trashed task', async () => {
    const alice = aUser()
    const { boardId, taskId } = await aTaskOf(alice)
    const task = `/boards/${boardId}/tasks/${taskId}`
    const comment = () =>
      api.as(alice).post(`${task}/comments`, { body: 'Shelved' })

    await api.as(alice).post(`${task}/archive`, {})
    expect((await comment()).statusCode).toBe(409)
    await api.as(alice).post(`${task}/restore`, {})
    await api.as(alice).delete(task)
    expect((await comment()).statusCode).toBe(409)
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

describe('comment reactions', () => {
  interface Listed {
    id: string
    reactions: {
      emoji: string
      people: { userId: string; email: string; name: string | null }[]
    }[]
  }

  async function aComment(owner: TestUser) {
    const { boardId, taskId } = await aTaskOf(owner)
    const comments = `/boards/${boardId}/tasks/${taskId}/comments`
    const { id } = (
      await api.as(owner).post(comments, { body: 'Which palette?' })
    ).json<{ id: string }>()
    const reaction = (emoji: string) =>
      `${comments}/${id}/reactions/${encodeURIComponent(emoji)}`
    const reactionsOf = async (viewer: TestUser) =>
      (await api.as(viewer).get(comments))
        .json<{ comments: Listed[] }>()
        .comments.find(comment => comment.id === id)?.reactions
    return { boardId, taskId, id, reaction, reactionsOf }
  }

  it('lists each emoji once, with who gave it, in the order it was first given', async () => {
    const alice = aUser({ name: 'Alice Martin' })
    const bob = aUser({ organizationId: alice.organizationId })
    const { boardId, reaction, reactionsOf } = await aComment(alice)
    await joinBoard(db, alice, boardId, bob, 'editor')

    expect((await api.as(bob).put(reaction('👍️'))).statusCode).toBe(204)
    await api.as(alice).put(reaction('🎉'))
    await api.as(alice).put(reaction('👍️'))

    expect(await reactionsOf(alice)).toEqual([
      {
        emoji: '👍️',
        people: [
          expect.objectContaining({ userId: bob.userId, email: bob.email }),
          expect.objectContaining({
            userId: alice.userId,
            name: 'Alice Martin'
          })
        ]
      },
      {
        emoji: '🎉',
        people: [expect.objectContaining({ userId: alice.userId })]
      }
    ])
  })

  it('counts a reaction given twice once', async () => {
    const alice = aUser()
    const { reaction, reactionsOf } = await aComment(alice)

    await api.as(alice).put(reaction('🎉'))
    const again = await api.as(alice).put(reaction('🎉'))

    expect(again.statusCode).toBe(204)
    expect((await reactionsOf(alice))?.[0]?.people).toHaveLength(1)
  })

  it('takes back only the reaction of whoever asks', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const { boardId, reaction, reactionsOf } = await aComment(alice)
    await joinBoard(db, alice, boardId, bob, 'editor')
    await api.as(alice).put(reaction('🎉'))
    await api.as(bob).put(reaction('🎉'))

    const removed = await api.as(bob).delete(reaction('🎉'))

    expect(removed.statusCode).toBe(204)
    expect((await reactionsOf(alice))?.[0]?.people).toEqual([
      expect.objectContaining({ userId: alice.userId })
    ])
  })

  it('lets viewers react and hides the comment from outsiders', async () => {
    const alice = aUser()
    const viewer = aUser({ organizationId: alice.organizationId })
    const outsider = aUser({ organizationId: alice.organizationId })
    const { boardId, reaction } = await aComment(alice)
    await joinBoard(db, alice, boardId, viewer, 'viewer')

    expect((await api.as(viewer).put(reaction('👀'))).statusCode).toBe(204)
    expect((await api.as(outsider).put(reaction('👀'))).statusCode).toBe(404)
  })

  it('refuses text that is not an emoji', async () => {
    const alice = aUser()
    const { reaction } = await aComment(alice)

    for (const text of ['ok', '1', '<b>', '👍 ok', '🎉🎉']) {
      expect((await api.as(alice).put(reaction(text))).statusCode).toBe(400)
    }
  })

  it('accepts emoji made of several joined together', async () => {
    const alice = aUser()
    const { reaction, reactionsOf } = await aComment(alice)

    for (const emoji of ['👩🏽‍💻', '🇫🇷', '❤️', '1️⃣']) {
      expect((await api.as(alice).put(reaction(emoji))).statusCode).toBe(204)
    }
    expect((await reactionsOf(alice))?.map(r => r.emoji)).toEqual([
      '👩🏽‍💻',
      '🇫🇷',
      '❤️',
      '1️⃣'
    ])
  })

  it('refuses a comment of another task', async () => {
    const alice = aUser()
    const first = await aComment(alice)
    const other = await aTaskOf(alice, 'OPS')

    const response = await api
      .as(alice)
      .put(
        `/boards/${other.boardId}/tasks/${other.taskId}/comments/${first.id}/reactions/${encodeURIComponent('🎉')}`
      )

    expect(response.statusCode).toBe(404)
  })

  it('refuses reactions on an archived board', async () => {
    const alice = aUser()
    const { boardId, reaction } = await aComment(alice)
    await api.as(alice).post(`/boards/${boardId}/archive`, {})

    expect((await api.as(alice).put(reaction('🎉'))).statusCode).toBe(409)
  })
})
