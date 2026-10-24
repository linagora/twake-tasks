import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadConfig, rateLimits, type RateLimits } from '../../config.ts'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'
import { openStream } from '../../testing/stream.ts'
import { BUDGETED_ROUTES } from './budgets.ts'

let api: Awaited<ReturnType<typeof startApp>>
let baseUrl: string

function limitsWith(env: Record<string, string>): RateLimits {
  return rateLimits(
    loadConfig({
      RABBITMQ_URL: 'amqp://rabbitmq:5672',
      DATABASE_URL: 'postgres://tasks@postgres/tasks',
      APP_URL: 'https://tasks.example.com',
      OIDC_ISSUER: 'https://auth.example.com',
      OIDC_CLIENT_SECRET: 'secret',
      ...env
    })
  )
}

beforeAll(async () => {
  api = await startApp({
    limits: limitsWith({
      RATE_LIMIT_COMMENTS_MAX: '2',
      RATE_LIMIT_SEARCH_MAX: '3',
      RATE_LIMIT_OTHER_APP_SEARCH_MAX: '1',
      RATE_LIMIT_OPEN_STREAMS: '2'
    })
  })
  baseUrl = await api.listen()
})

afterAll(async () => {
  await api.close()
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

describe('per user budgets', () => {
  it.each(BUDGETED_ROUTES)('name a route that exists: %s', route => {
    const [method, path] = route.split(' ') as [string, string]

    expect(api.hasRoute({ method: method, url: `/api${path}` })).toBe(true)
  })

  it('refuse a comment past the budget, and leave other writes alone', async () => {
    const alice = aUser()
    const bob = aUser()
    const { boardId, taskId } = await aTaskOf(alice)
    const path = `/boards/${boardId}/tasks/${taskId}/comments`
    await api.as(alice).post(path, { body: 'one' })
    await api.as(alice).post(path, { body: 'two' })

    const third = await api.as(alice).post(path, { body: 'three' })
    const task = await api
      .as(alice)
      .post(`/boards/${boardId}/tasks`, { sectionId: null, title: 'Next' })
    const bobs = await aTaskOf(bob)
    const elsewhere = await api
      .as(bob)
      .post(`/boards/${bobs.boardId}/tasks/${bobs.taskId}/comments`, {
        body: 'mine'
      })

    expect(third.statusCode).toBe(429)
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0)
    expect(task.statusCode).toBe(201)
    expect(elsewhere.statusCode).toBe(201)
  })

  it('give a search token of another app the lower budget', async () => {
    const alice = aUser()
    const headers = {
      authorization: `Bearer ${api.tokenOf(alice, { searchOnly: true })}`
    }
    const search = () =>
      api.inject({ method: 'GET', url: '/api/search?q=logo', headers })

    expect((await search()).statusCode).toBe(200)
    expect((await search()).statusCode).toBe(429)
    expect((await api.as(alice).get('/search?q=logo')).statusCode).toBe(200)
  })
})

describe('live streams', () => {
  it('stay under the cap per user, and free their place on close', async () => {
    const alice = aUser()
    const bob = aUser()
    const { boardId } = await aTaskOf(alice)
    const bobs = await aTaskOf(bob)
    const open = (user: TestUser, board: string) =>
      openStream(`${baseUrl}/api/boards/${board}/events`, api.tokenOf(user))
    const first = open(alice, boardId)
    const second = open(alice, boardId)
    await first.messages.next()
    await second.messages.next()

    const third = await open(alice, boardId).response
    const bobsStream = open(bob, bobs.boardId)
    await bobsStream.messages.next()
    first.close()
    let fourth: ReturnType<typeof open> | undefined
    await vi.waitFor(async () => {
      fourth = open(alice, boardId)
      expect((await fourth.response).status).toBe(200)
    })

    expect(third.status).toBe(429)
    expect(third.headers.get('retry-after')).toBe('30')
    for (const stream of [second, bobsStream, fourth]) stream?.close()
  })
})
