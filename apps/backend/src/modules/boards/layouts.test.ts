import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
})

const layoutOf = async (user: TestUser, boardId: string) =>
  (await api.as(user).get(`/boards/${boardId}`)).json<{
    layout: string
    defaultLayout: string
  }>()

async function aBoard(owner: TestUser) {
  return (
    await api.as(owner).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<{ id: string; layout: string; defaultLayout: string }>()
}

describe('board layouts', () => {
  it('opens as a board until someone picks another layout', async () => {
    const owner = aUser()
    const board = await aBoard(owner)

    expect(board).toMatchObject({ layout: 'board', defaultLayout: 'board' })

    const response = await api
      .as(owner)
      .put(`/boards/${board.id}/layout`, { layout: 'list' })

    expect(response.statusCode).toBe(204)
    expect(await layoutOf(owner, board.id)).toEqual(
      expect.objectContaining({ layout: 'list', defaultLayout: 'board' })
    )
  })

  it('lets an admin change the default, which a personal pick overrides', async () => {
    const owner = aUser()
    const board = await aBoard(owner)

    await api
      .as(owner)
      .put(`/boards/${board.id}/default-layout`, { layout: 'calendar' })
    expect(await layoutOf(owner, board.id)).toEqual(
      expect.objectContaining({ layout: 'calendar', defaultLayout: 'calendar' })
    )

    await api.as(owner).put(`/boards/${board.id}/layout`, { layout: 'list' })
    expect((await layoutOf(owner, board.id)).layout).toBe('list')
  })

  it('refuses unknown layouts and boards I cannot see', async () => {
    const owner = aUser()
    const board = await aBoard(owner)
    const stranger = aUser({ organizationId: owner.organizationId })

    expect(
      (
        await api
          .as(owner)
          .put(`/boards/${board.id}/layout`, { layout: 'gantt' })
      ).statusCode
    ).toBe(400)
    expect(
      (
        await api
          .as(stranger)
          .put(`/boards/${board.id}/layout`, { layout: 'list' })
      ).statusCode
    ).toBe(404)
    expect(
      (
        await api
          .as(stranger)
          .put(`/boards/${board.id}/default-layout`, { layout: 'list' })
      ).statusCode
    ).toBe(404)
  })
})
