import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { createServer } from '../../infra/http.ts'
import { registerRateLimit } from '../../infra/rateLimit.ts'
import {
  createAuthenticator,
  IdentityProviderBusy,
  type Authenticate
} from './authenticator.ts'
import type { Identity, IdentityProvider } from './oidc.ts'
import { registerAuth, type AddressLimits } from './routes.ts'
import type { AuthStore } from './store.ts'
import { anIdentity } from './testing.ts'

async function setUp(
  authenticate: Authenticate = () => Promise.resolve(anIdentity()),
  addressLimits?: AddressLimits
) {
  const app = createServer({
    logger: pino({ level: 'silent' }),
    isReady: () => Promise.resolve(true)
  })
  await registerRateLimit(app)
  const provider: IdentityProvider = {
    identify: vi.fn(),
    verifyLogoutToken: vi.fn((token: string) =>
      token === 'valid'
        ? Promise.resolve('session-1')
        : Promise.reject(new Error('invalid'))
    )
  }
  const store = {
    isRevoked: vi.fn(() => Promise.resolve(false)),
    revoke: vi.fn(() => Promise.resolve())
  } satisfies AuthStore
  const { requireIdentity } = registerAuth(app, {
    authenticate,
    provider,
    store,
    addressLimits
  })
  app.get('/whoami', { preHandler: requireIdentity }, request => ({
    email: request.identity?.email,
    organizationId: request.identity?.organizationId
  }))
  app.get(
    '/search',
    { preHandler: requireIdentity, config: { searchTokens: true } },
    () => ({ ok: true })
  )
  return { app, store }
}

function aRealAuthenticator() {
  const identify = vi.fn((token: string) =>
    Promise.resolve<Identity | null>(token === 'good' ? anIdentity() : null)
  )
  const authenticate = createAuthenticator({
    provider: { identify, verifyLogoutToken: vi.fn() },
    store: { isRevoked: () => Promise.resolve(false), revoke: vi.fn() }
  })
  return { authenticate, identify }
}

describe('requireIdentity', () => {
  it('asks for a bearer token', async () => {
    const { app } = await setUp()

    const response = await app.inject({ method: 'GET', url: '/whoami' })

    expect(response.statusCode).toBe(401)
    expect(response.headers['www-authenticate']).toBe('Bearer')
  })

  it('refuses an invalid token', async () => {
    const { app } = await setUp(() => Promise.resolve(null))

    const response = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: 'Bearer nope' }
    })

    expect(response.statusCode).toBe(401)
    expect(response.headers['www-authenticate']).toBe(
      'Bearer error="invalid_token"'
    )
  })

  it.each([
    ['cannot be checked', new Error('sso down')],
    ['waits on too many checks already', new IdentityProviderBusy()]
  ])('answers 503 when the SSO %s', async (_case, error) => {
    const { app } = await setUp(() => Promise.reject(error))

    const response = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: 'Bearer token' }
    })

    expect(response.statusCode).toBe(503)
  })

  it('lets a token good for search only through on search routes alone', async () => {
    const { app } = await setUp(() =>
      Promise.resolve(anIdentity({ searchOnly: true }))
    )
    const headers = { authorization: 'Bearer token' }

    const search = await app.inject({ method: 'GET', url: '/search', headers })
    const other = await app.inject({ method: 'GET', url: '/whoami', headers })

    expect(search.statusCode).toBe(200)
    expect(other.statusCode).toBe(401)
    expect(other.headers['www-authenticate']).toBe(
      'Bearer error="invalid_token"'
    )
  })

  it.each([
    ['a B2B user', 'org-1'],
    ['a B2C user, who has no organization', null]
  ])('lets %s through', async (_case, organizationId) => {
    const { app } = await setUp(() =>
      Promise.resolve(anIdentity({ organizationId }))
    )

    const response = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: 'Bearer token' }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      email: 'alice@example.com',
      organizationId
    })
  })
})

describe('refused tokens from one address', () => {
  function call(
    app: Awaited<ReturnType<typeof setUp>>['app'],
    token: string,
    remoteAddress = '203.0.113.7'
  ) {
    return app.inject({
      method: 'GET',
      url: '/whoami',
      remoteAddress,
      headers: { authorization: `Bearer ${token}` }
    })
  }

  it('stop reaching the SSO past 30 a minute', async () => {
    const { authenticate, identify } = aRealAuthenticator()
    const { app } = await setUp(authenticate)
    for (let i = 0; i < 30; i++) {
      expect((await call(app, `bad-${String(i)}`)).statusCode).toBe(401)
    }

    const response = await call(app, 'bad-30')

    expect(response.statusCode).toBe(429)
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0)
    expect(identify).toHaveBeenCalledTimes(30)
    expect((await call(app, 'good')).statusCode).toBe(429)
  })

  it('wait while 5 of their tokens are being checked', async () => {
    const answers: (() => void)[] = []
    const authenticate = createAuthenticator({
      provider: {
        identify: () =>
          new Promise(resolve => {
            answers.push(() => {
              resolve(null)
            })
          }),
        verifyLogoutToken: vi.fn()
      },
      store: { isRevoked: () => Promise.resolve(false), revoke: vi.fn() }
    })
    const { app } = await setUp(authenticate)
    const checking = Array.from({ length: 5 }, (_, i) =>
      call(app, `bad-${String(i)}`)
    )
    await vi.waitFor(() => {
      expect(answers).toHaveLength(5)
    })

    const sixth = await call(app, 'bad-5')
    const elsewhere = call(app, 'bad-6', '198.51.100.1')
    await vi.waitFor(() => {
      expect(answers).toHaveLength(6)
    })
    for (const answer of answers) answer()

    expect(sixth.statusCode).toBe(429)
    expect((await elsewhere).statusCode).toBe(401)
    for (const response of await Promise.all(checking)) {
      expect(response.statusCode).toBe(401)
    }
    const next = call(app, 'bad-7')
    await vi.waitFor(() => {
      expect(answers).toHaveLength(7)
    })
    answers[6]?.()
    expect((await next).statusCode).toBe(401)
  })

  it('leave other addresses alone', async () => {
    const { authenticate } = aRealAuthenticator()
    const { app } = await setUp(authenticate)
    for (let i = 0; i < 30; i++) await call(app, `bad-${String(i)}`)

    expect((await call(app, 'good', '198.51.100.1')).statusCode).toBe(200)
  })

  it('leave a token already checked through', async () => {
    const { authenticate } = aRealAuthenticator()
    const { app } = await setUp(authenticate)
    await call(app, 'good')
    for (let i = 0; i < 30; i++) await call(app, `bad-${String(i)}`)

    expect((await call(app, 'good')).statusCode).toBe(200)
  })

  it('take the configured budget, and none at 0', async () => {
    const limits = (max: number): AddressLimits => ({
      refusedTokens: { max, windowSeconds: 10 },
      logoutRefusals: { max, windowSeconds: 10 },
      tokenChecks: 0
    })
    const { app: strict } = await setUp(
      aRealAuthenticator().authenticate,
      limits(2)
    )
    const { app: open } = await setUp(
      aRealAuthenticator().authenticate,
      limits(0)
    )
    for (let i = 0; i < 2; i++) {
      await call(strict, `bad-${String(i)}`)
      await call(open, `bad-${String(i)}`)
    }
    for (let i = 2; i < 40; i++) await call(open, `bad-${String(i)}`)

    const refused = await call(strict, 'bad-2')
    expect(refused.statusCode).toBe(429)
    expect(Number(refused.headers['retry-after'])).toBeLessThanOrEqual(10)
    expect((await call(open, 'bad-40')).statusCode).toBe(401)
  })

  it('count a token once, however often it comes back', async () => {
    const { authenticate } = aRealAuthenticator()
    const { app } = await setUp(authenticate)
    for (let i = 0; i < 40; i++) await call(app, 'expired')

    expect((await call(app, 'good')).statusCode).toBe(200)
  })
})

describe('POST /auth/backchannel-logout', () => {
  function logout(
    app: Awaited<ReturnType<typeof setUp>>['app'],
    payload = 'logout_token=valid'
  ) {
    return app.inject({
      method: 'POST',
      url: '/auth/backchannel-logout',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload
    })
  }

  it('revokes the session of a valid logout token', async () => {
    const { app, store } = await setUp()

    const response = await logout(app)

    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(store.revoke).toHaveBeenCalledWith('session-1', expect.any(Date))
  })

  it.each([['logout_token=forged'], ['']])('refuses %j', async payload => {
    const { app, store } = await setUp()

    const response = await logout(app, payload)

    expect(response.statusCode).toBe(400)
    expect(store.revoke).not.toHaveBeenCalled()
  })

  it('takes every valid logout token', async () => {
    const { app } = await setUp()

    for (let i = 0; i < 100; i++) {
      expect((await logout(app)).statusCode).toBe(200)
    }
  })

  it('stops checking tokens from an address past 60 refused a minute', async () => {
    const { app, store } = await setUp()
    for (let i = 0; i < 60; i++) {
      expect((await logout(app, 'logout_token=forged')).statusCode).toBe(400)
    }

    const response = await logout(app)

    expect(response.statusCode).toBe(429)
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0)
    expect(store.revoke).not.toHaveBeenCalled()
  })

  it('answers a blocked address 429 whatever its body', async () => {
    const { app } = await setUp()
    for (let i = 0; i < 60; i++) await logout(app, 'logout_token=forged')

    const response = await logout(app, '')

    expect(response.statusCode).toBe(429)
    expect(response.headers['cache-control']).toBe('no-store')
  })
})
