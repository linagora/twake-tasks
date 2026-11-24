import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aUser, startApp } from '../../testing/app.ts'
import { postgresAuthStore } from './store.ts'

let api: Awaited<ReturnType<typeof startApp>>

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
})

// The logout reaches another replica: this one keeps nothing of it.
async function aRevokedSession() {
  const user = aUser()
  const sessionId = randomUUID()
  const headers = {
    authorization: `Bearer ${api.tokenOf(user, { sessionId })}`
  }
  const board = (
    await api.inject({
      method: 'POST',
      url: '/api/boards',
      headers,
      payload: { name: 'Design', keyPrefix: 'DES' }
    })
  ).json<{ id: string }>()
  await postgresAuthStore(api.db).revoke(sessionId)
  return { headers, boardId: board.id }
}

describe('a revoked session', () => {
  it.each([
    ['a board read', 'GET', (boardId: string) => `/api/boards/${boardId}`],
    ['a board write', 'PATCH', (boardId: string) => `/api/boards/${boardId}`],
    [
      'a project write',
      'POST',
      () => `/api/projects/${randomUUID()}/templates`
    ],
    ['a route with no board', 'GET', () => '/api/settings']
  ] as const)('is refused on %s', async (_case, method, url) => {
    const { headers, boardId } = await aRevokedSession()

    const response = await api.inject({
      method,
      url: url(boardId),
      headers,
      ...(method === 'PATCH' && { payload: { name: 'Brand' } })
    })

    expect(response.statusCode).toBe(401)
    expect(response.headers['www-authenticate']).toBe(
      'Bearer error="invalid_token"'
    )
    expect(response.json()).toEqual({ error: 'unauthorized' })
  })
})
