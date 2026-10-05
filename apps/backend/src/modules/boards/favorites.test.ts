import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'

interface Summary {
  id: string
  name: string
  favorite: boolean
}

let api: Awaited<ReturnType<typeof startApp>>

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
})

const listed = async (user: TestUser) =>
  (await api.as(user).get('/boards')).json<{ boards: Summary[] }>().boards

async function aBoard(user: TestUser, name: string, keyPrefix: string) {
  return (await api.as(user).post('/boards', { name, keyPrefix })).json<{
    id: string
  }>()
}

describe('favorite boards', () => {
  it('lists favorites first, after the Inbox, until unstarred', async () => {
    const alice = aUser()
    await aBoard(alice, 'Design', 'DES')
    const ops = await aBoard(alice, 'Ops', 'OPS')

    const starred = await api.as(alice).put(`/boards/${ops.id}/favorite`)
    const withFavorite = await listed(alice)
    const unstarred = await api.as(alice).delete(`/boards/${ops.id}/favorite`)
    const without = await listed(alice)

    expect([starred.statusCode, unstarred.statusCode]).toEqual([204, 204])
    expect(withFavorite.map(board => [board.name, board.favorite])).toEqual([
      ['Inbox', false],
      ['Ops', true],
      ['Design', false]
    ])
    expect(without.map(board => board.name)).toEqual(['Inbox', 'Design', 'Ops'])
  })

  it('keeps favorites personal', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const design = await aBoard(alice, 'Design', 'DES')

    await api.as(alice).put(`/boards/${design.id}/favorite`)
    await api.as(alice).put(`/boards/${design.id}/favorite`)
    const outsider = await api.as(bob).put(`/boards/${design.id}/favorite`)

    expect(outsider.statusCode).toBe(404)
    expect(
      (await listed(alice)).find(board => board.id === design.id)?.favorite
    ).toBe(true)
  })
})
