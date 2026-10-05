import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'

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

// Reads server-sent events as `id` and `data` pairs, one per message.
function openStream(user: TestUser, boardId: string) {
  const controller = new AbortController()
  const response = fetch(`${baseUrl}/api/boards/${boardId}/events`, {
    headers: { authorization: `Bearer ${api.tokenOf(user)}` },
    signal: controller.signal
  })
  let buffer = ''
  const decoder = new TextDecoder()
  async function* messages() {
    const body = (await response).body
    if (!body) return
    for await (const chunk of body) {
      buffer += decoder.decode(chunk as Uint8Array, { stream: true })
      let end = buffer.indexOf('\n\n')
      while (end >= 0) {
        const block = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        const fields = Object.fromEntries(
          block
            .split('\n')
            .filter(line => !line.startsWith(':'))
            .map(line => [
              line.slice(0, line.indexOf(':')),
              line.slice(line.indexOf(':') + 2)
            ])
        ) as Record<string, string>
        if (fields.id !== undefined) yield fields
        end = buffer.indexOf('\n\n')
      }
    }
  }
  return {
    response,
    messages: messages(),
    close: () => {
      controller.abort()
    }
  }
}

describe('live board updates', () => {
  it('sends the board version, then each new version as the board changes', async () => {
    const alice = aUser()
    const board = await aBoardOf(alice)
    const stream = openStream(alice, board.id)

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
    const stream = openStream(aUser(), board.id)

    expect((await stream.response).status).toBe(404)
    stream.close()
  })
})
