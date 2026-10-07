import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'
import { openStream } from '../../testing/stream.ts'

let api: Awaited<ReturnType<typeof startApp>>
let baseUrl: string

beforeAll(async () => {
  api = await startApp()
  baseUrl = await api.listen()
})

afterAll(async () => {
  await api.close()
})

async function aBoardOf(owner: TestUser) {
  return (
    await api.as(owner).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<{ id: string; sections: { id: string }[] }>()
}

const openBoardStream = (user: TestUser, boardId: string) =>
  openStream(`${baseUrl}/api/boards/${boardId}/events`, api.tokenOf(user))

describe('live board updates', () => {
  it('sends the board version, then each new version as the board changes', async () => {
    const alice = aUser()
    const board = await aBoardOf(alice)
    const stream = openBoardStream(alice, board.id)

    const first = (await stream.messages.next()).value
    await api.as(alice).post(`/boards/${board.id}/tasks`, {
      sectionId: board.sections[0]?.id,
      title: 'Logo'
    })
    const second = (await stream.messages.next()).value
    stream.close()

    expect((await stream.response).headers.get('content-type')).toBe(
      'text/event-stream'
    )
    expect(Number(second?.id)).toBe(Number(first?.id) + 1)
    expect(JSON.parse(second?.data ?? '')).toEqual({
      version: Number(second?.id)
    })
  })

  it('refuses a stream on a board the person cannot see', async () => {
    const board = await aBoardOf(aUser())
    const stream = openBoardStream(aUser(), board.id)

    expect((await stream.response).status).toBe(404)
    stream.close()
  })
})
