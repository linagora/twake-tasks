import { Redis } from 'ioredis'
import { pino } from 'pino'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Budget, UserBudget } from '../../config.ts'
import { createServer } from '../../infra/http.ts'
import { registerRateLimit } from '../../infra/rateLimit.ts'
import type { AuthStore } from './store.ts'
import { anIdentity } from './testing.ts'
import { registerAuth } from './routes.ts'
import { limitUsers, type BudgetsOf } from './userLimits.ts'

const off: Budget = { max: 0, windowSeconds: 60 }

const noBudgets: Record<UserBudget, Budget> = {
  requests: off,
  writes: off,
  taskCreates: off,
  comments: off,
  reactions: off,
  reminders: off,
  labelEdits: off,
  boardCreates: off,
  invites: off,
  invitesDaily: off,
  search: off,
  otherAppSearch: off,
  peopleSearch: off,
  heavyReads: off,
  streamConnects: off
}

const budgetsOf: BudgetsOf = (method, path) =>
  method === 'POST' && path === '/notes' ? ['writes'] : []

async function setUp(
  budgets: Partial<Record<UserBudget, Budget>>,
  redis?: Redis
) {
  const app = createServer({
    logger: pino({ level: 'silent' }),
    isReady: () => Promise.resolve(true)
  })
  await registerRateLimit(app, redis)
  const store = {
    isRevoked: vi.fn(() => Promise.resolve(false)),
    revoke: vi.fn(() => Promise.resolve())
  } satisfies AuthStore
  await app.register(
    api => {
      const requireIdentity = registerAuth(api, {
        // The token is the user's id.
        authenticate: token => Promise.resolve(anIdentity({ userId: token })),
        provider: { identify: vi.fn(), verifyLogoutToken: vi.fn() },
        store,
        limitUser: limitUsers(api, { ...noBudgets, ...budgets }, budgetsOf)
      })
      api.get('/notes', { preHandler: requireIdentity }, () => ({ ok: true }))
      api.post('/notes', { preHandler: requireIdentity }, () => ({ ok: true }))
      return Promise.resolve()
    },
    { prefix: '/api' }
  )
  return app
}

type App = Awaited<ReturnType<typeof setUp>>

const call = (
  app: App,
  user: string,
  method: 'GET' | 'POST' | 'HEAD' = 'GET'
) =>
  app.inject({
    method,
    url: '/api/notes',
    headers: { authorization: `Bearer ${user}` }
  })

describe('per user limits', () => {
  it('answer 429 with Retry-After past the budget, for that user alone', async () => {
    const app = await setUp({ requests: { max: 2, windowSeconds: 30 } })

    await call(app, 'alice')
    await call(app, 'alice')
    const refused = await call(app, 'alice')
    const bob = await call(app, 'bob')

    expect(refused.statusCode).toBe(429)
    expect(refused.json()).toEqual({ error: 'too_many_requests' })
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0)
    expect(Number(refused.headers['retry-after'])).toBeLessThanOrEqual(30)
    expect(bob.statusCode).toBe(200)
  })

  it('count a route on its own budget on top of the overall one', async () => {
    const app = await setUp({
      requests: { max: 10, windowSeconds: 60 },
      writes: { max: 1, windowSeconds: 60 }
    })

    expect((await call(app, 'alice', 'POST')).statusCode).toBe(200)
    expect((await call(app, 'alice', 'POST')).statusCode).toBe(429)
    expect((await call(app, 'alice')).statusCode).toBe(200)
  })

  it('count a HEAD request as its GET', async () => {
    const app = await setUp({ requests: { max: 1, windowSeconds: 60 } })

    await call(app, 'alice', 'HEAD')

    expect((await call(app, 'alice')).statusCode).toBe(429)
  })

  it('are off at 0', async () => {
    const app = await setUp({})

    const answers = await Promise.all(
      Array.from({ length: 20 }, () => call(app, 'alice', 'POST'))
    )

    expect(answers.every(answer => answer.statusCode === 200)).toBe(true)
  })

  describe('on Redis', () => {
    let container: StartedTestContainer
    const clients: Redis[] = []

    beforeAll(async () => {
      container = await new GenericContainer('redis:7-alpine')
        .withExposedPorts(6379)
        .start()
    })

    afterAll(async () => {
      for (const client of clients) client.disconnect()
      await container.stop()
    })

    function aClient() {
      const client = new Redis(
        container.getMappedPort(6379),
        container.getHost()
      )
      clients.push(client)
      return client
    }

    it('share one count across replicas', async () => {
      const budget = { requests: { max: 2, windowSeconds: 60 } }
      const first = await setUp(budget, aClient())
      const second = await setUp(budget, aClient())

      await call(first, 'carol')
      await call(second, 'carol')

      expect((await call(first, 'carol')).statusCode).toBe(429)
      expect((await call(second, 'carol')).statusCode).toBe(429)
    })
  })
})
