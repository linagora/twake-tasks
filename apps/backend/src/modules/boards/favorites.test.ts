import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'

interface Summary {
  id: string
  name: string
  favorite: boolean
  openTasks: number
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

  it('counts the open top-level tasks of each board', async () => {
    const alice = aUser()
    const design = await aBoard(alice, 'Design', 'DES')
    const add = async (title: string, parentId?: string) =>
      (
        await api
          .as(alice)
          .post(
            `/boards/${design.id}/tasks`,
            parentId ? { title, parentId } : { title, sectionId: null }
          )
      ).json<{ id: string }>().id
    const logo = await add('Logo')
    await add('Sketch', logo)
    const poster = await add('Poster')
    const flyer = await add('Flyer')
    await add('Banner')
    await api.as(alice).post(`/boards/${design.id}/tasks/${poster}/complete`, {
      state: 'completed'
    })
    await api.as(alice).post(`/boards/${design.id}/tasks/${flyer}/archive`, {})

    const listedDesign = (await listed(alice)).find(
      board => board.id === design.id
    )

    expect(listedDesign?.openTasks).toBe(2)
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
