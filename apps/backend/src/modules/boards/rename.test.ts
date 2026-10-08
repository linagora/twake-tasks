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

type Board = { id: string; name: string; version: number }

async function aBoardOf(owner: TestUser) {
  return (
    await api.as(owner).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<Board>().id
}

const boardOf = async (user: TestUser, boardId: string) =>
  (await api.as(user).get(`/boards/${boardId}`)).json<Board>()

const rename = (user: TestUser, boardId: string, name: string) =>
  api.as(user).patch(`/boards/${boardId}`, { name })

describe('renaming a board', () => {
  it('lets an admin rename it, which bumps the version', async () => {
    const owner = aUser()
    const boardId = await aBoardOf(owner)
    const before = await boardOf(owner, boardId)

    const response = await rename(owner, boardId, '  Product  ')

    expect(response.statusCode).toBe(204)
    const after = await boardOf(owner, boardId)
    expect(after.name).toBe('Product')
    expect(after.version).toBeGreaterThan(before.version)
  })

  it('refuses an editor', async () => {
    const owner = aUser()
    const editor = aUser({ organizationId: owner.organizationId })
    const boardId = await aBoardOf(owner)
    await joinBoard(db, owner, boardId, editor, 'editor')

    expect((await rename(editor, boardId, 'Product')).statusCode).toBe(403)
    expect((await boardOf(owner, boardId)).name).toBe('Design')
  })

  it('refuses an empty or too long name', async () => {
    const owner = aUser()
    const boardId = await aBoardOf(owner)

    expect((await rename(owner, boardId, '   ')).statusCode).toBe(400)
    expect((await rename(owner, boardId, 'x'.repeat(101))).statusCode).toBe(400)
    expect((await rename(owner, boardId, 'x'.repeat(100))).statusCode).toBe(204)
  })

  it('refuses the inbox and archived boards', async () => {
    const owner = aUser()
    const boardId = await aBoardOf(owner)
    const inbox = (await api.as(owner).get('/boards'))
      .json<{ boards: { id: string; inbox: boolean }[] }>()
      .boards.find(board => board.inbox)
    const inboxBefore = await boardOf(owner, inbox?.id ?? '')

    expect((await rename(owner, inbox?.id ?? '', 'Mine')).statusCode).toBe(403)
    expect(await boardOf(owner, inbox?.id ?? '')).toEqual(inboxBefore)

    await api.as(owner).post(`/boards/${boardId}/archive`, {})
    expect((await rename(owner, boardId, 'Product')).statusCode).toBe(409)
    expect((await boardOf(owner, boardId)).name).toBe('Design')
  })

  it('hides the board from a stranger', async () => {
    const owner = aUser()
    const boardId = await aBoardOf(owner)

    expect((await rename(aUser(), boardId, 'Product')).statusCode).toBe(404)
  })

  it('refuses control and invisible characters, but keeps emoji sequences', async () => {
    const owner = aUser()
    const boardId = await aBoardOf(owner)

    for (const name of [
      'Two\nlines',
      'Tab\there',
      'Flip\u202Eed',
      'Zero\u200Bwidth'
    ]) {
      expect((await rename(owner, boardId, name)).statusCode).toBe(400)
      expect(
        (await api.as(owner).post('/boards', { name, keyPrefix: 'BAD' }))
          .statusCode
      ).toBe(400)
    }
    const emoji = 'Design 👩\u200D💻'
    expect((await rename(owner, boardId, emoji)).statusCode).toBe(204)
    expect((await boardOf(owner, boardId)).name).toBe(emoji)
    expect(
      (await api.as(owner).post('/boards', { name: emoji, keyPrefix: 'EMO' }))
        .statusCode
    ).toBe(201)
  })
})
