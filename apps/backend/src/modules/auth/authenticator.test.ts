import { describe, expect, it, vi } from 'vitest'
import {
  createAuthenticator,
  IdentityProviderBusy,
  TooManyFailures
} from './authenticator.ts'
import type { Identity, IdentityProvider } from './oidc.ts'
import type { AuthStore } from './store.ts'
import { anIdentity } from './testing.ts'

function setUp(
  identity: Identity | null = anIdentity(),
  limits?: Parameters<typeof createAuthenticator>[0]['limits']
) {
  let clock = Date.now()
  const revoked = new Set<string>()
  const provider: IdentityProvider = {
    identify: vi.fn(() => Promise.resolve(identity)),
    verifyLogoutToken: vi.fn()
  }
  const store: AuthStore = {
    isRevoked: sessionId => Promise.resolve(revoked.has(sessionId)),
    revoke: vi.fn()
  }
  const authenticate = createAuthenticator({
    provider,
    store,
    now: () => clock,
    limits
  })
  return {
    authenticate,
    identify: provider.identify,
    revoked,
    advance: (ms: number) => {
      clock += ms
    }
  }
}

describe('createAuthenticator', () => {
  it('asks the provider once per token within 60 seconds', async () => {
    const { authenticate, identify, advance } = setUp()

    await authenticate('token')
    advance(59_000)
    await authenticate('token')

    expect(identify).toHaveBeenCalledTimes(1)
  })

  it('asks the provider again after 60 seconds', async () => {
    const { authenticate, identify, advance } = setUp()

    await authenticate('token')
    advance(60_000)
    await authenticate('token')

    expect(identify).toHaveBeenCalledTimes(2)
  })

  it('does not keep a token past its expiry', async () => {
    const identity = anIdentity({ expiresAt: new Date(Date.now() + 10_000) })
    const { authenticate, identify, advance } = setUp(identity)

    await authenticate('token')
    advance(10_000)
    await authenticate('token')

    expect(identify).toHaveBeenCalledTimes(2)
  })

  it('remembers a refused token for 60 seconds', async () => {
    const { authenticate, identify, advance } = setUp(null)

    await expect(authenticate('token')).resolves.toBeNull()
    advance(59_000)
    await expect(authenticate('token')).resolves.toBeNull()
    expect(identify).toHaveBeenCalledTimes(1)

    advance(1_000)
    await authenticate('token')
    expect(identify).toHaveBeenCalledTimes(2)
  })

  it('forgets the oldest refused tokens past 10 000', async () => {
    const { authenticate, identify } = setUp(null)

    for (let i = 0; i <= 10_000; i++) await authenticate(`token-${String(i)}`)
    await authenticate('token-10000')
    expect(identify).toHaveBeenCalledTimes(10_001)

    await authenticate('token-0')
    expect(identify).toHaveBeenCalledTimes(10_002)
  })

  it('keeps refused tokens as long and as many as configured', async () => {
    const { authenticate, identify, advance } = setUp(null, {
      refusedTokenCache: { seconds: 5, size: 2 },
      tokenChecks: 50
    })

    await authenticate('a')
    await authenticate('b')
    await authenticate('a')
    expect(identify).toHaveBeenCalledTimes(2)
    await authenticate('c')
    await authenticate('a')
    expect(identify).toHaveBeenCalledTimes(4)

    advance(5_000)
    await authenticate('c')
    expect(identify).toHaveBeenCalledTimes(5)
  })

  it('keeps no refused token with a cache of 0', async () => {
    const { authenticate, identify } = setUp(null, {
      refusedTokenCache: { seconds: 0, size: 10 },
      tokenChecks: 50
    })

    await authenticate('a')
    await authenticate('a')

    expect(identify).toHaveBeenCalledTimes(2)
  })

  it.each([
    [2, 2],
    [0, 60]
  ])(
    'with %i checks in flight allowed, takes %i at once',
    async (tokenChecks, taken) => {
      const pending: (() => void)[] = []
      const { authenticate, identify } = setUp(anIdentity(), {
        refusedTokenCache: { seconds: 60, size: 10_000 },
        tokenChecks
      })
      vi.mocked(identify).mockImplementation(
        () =>
          new Promise(resolve => {
            pending.push(() => {
              resolve(anIdentity())
            })
          })
      )

      const results = Array.from({ length: 60 }, (_, i) =>
        authenticate(`token-${String(i)}`).then(
          () => 'checked',
          (error: unknown) =>
            error instanceof IdentityProviderBusy ? 'busy' : 'failed'
        )
      )
      await vi.waitFor(() => {
        expect(pending.length).toBe(taken)
      })
      for (const resolve of pending) resolve()

      expect(
        (await Promise.all(results)).filter(r => r === 'checked')
      ).toHaveLength(taken)
    }
  )

  it('asks the provider once for the same token checked at the same time', async () => {
    const { authenticate, identify } = setUp()

    const identities = await Promise.all([
      authenticate('token'),
      authenticate('token'),
      authenticate('token')
    ])

    expect(identities.map(identity => identity?.userId)).toEqual(
      Array(3).fill(anIdentity().userId)
    )
    expect(identify).toHaveBeenCalledTimes(1)
  })

  it('fails fast past 50 checks in flight, and takes new ones once they end', async () => {
    const pending: (() => void)[] = []
    const { authenticate, identify } = setUp()
    vi.mocked(identify).mockImplementation(
      () =>
        new Promise(resolve => {
          pending.push(() => {
            resolve(anIdentity())
          })
        })
    )

    const inFlight = Array.from({ length: 50 }, (_, i) =>
      authenticate(`token-${String(i)}`)
    )
    await expect(authenticate('one-too-many')).rejects.toBeInstanceOf(
      IdentityProviderBusy
    )
    for (const resolve of pending) resolve()
    await Promise.all(inFlight)

    vi.mocked(identify).mockResolvedValue(anIdentity())
    await expect(authenticate('next')).resolves.not.toBeNull()
  })

  describe('with a gate', () => {
    function aGate(waitFor: number | null = null) {
      return {
        enter: vi.fn(() => Promise.resolve(waitFor)),
        leave: vi.fn(),
        refused: vi.fn(() => Promise.resolve())
      }
    }

    it('counts a token the provider refuses', async () => {
      const { authenticate } = setUp(null)
      const gate = aGate()

      await authenticate('token', gate)

      expect(gate.refused).toHaveBeenCalledTimes(1)
    })

    it('gives back the place of each caller, whatever the check gives', async () => {
      const { authenticate, identify } = setUp()
      vi.mocked(identify).mockRejectedValueOnce(new Error('sso down'))
      const first = aGate()
      const second = aGate()

      await expect(authenticate('token', first)).rejects.toThrow('sso down')
      await Promise.all([
        authenticate('token', first),
        authenticate('token', second)
      ])

      expect(first.leave).toHaveBeenCalledTimes(2)
      expect(second.leave).toHaveBeenCalledTimes(1)
    })

    it('holds back a caller joining a check while its own gate is closed', async () => {
      const { authenticate } = setUp()

      const [open, closed] = await Promise.allSettled([
        authenticate('token', aGate()),
        authenticate('token', aGate(42))
      ])

      expect(open.status).toBe('fulfilled')
      expect(closed.status === 'rejected' && closed.reason).toBeInstanceOf(
        TooManyFailures
      )
    })

    it('does not count a token it already knows', async () => {
      const refusing = setUp(null)
      const accepting = setUp()
      const gate = aGate()
      await refusing.authenticate('token')
      await accepting.authenticate('token')

      await refusing.authenticate('token', gate)
      await accepting.authenticate('token', gate)

      expect(gate.enter).not.toHaveBeenCalled()
      expect(gate.refused).not.toHaveBeenCalled()
    })

    it('does not ask the provider while the gate is closed', async () => {
      const { authenticate, identify } = setUp()

      const check = authenticate('token', aGate(42))

      await expect(check).rejects.toBeInstanceOf(TooManyFailures)
      await expect(check).rejects.toMatchObject({ retryAfter: 42 })
      expect(identify).not.toHaveBeenCalled()
    })

    it('still takes a token it knows while the gate is closed', async () => {
      const { authenticate } = setUp()
      await authenticate('token')

      await expect(authenticate('token', aGate(42))).resolves.not.toBeNull()
    })
  })

  it('refuses a cached token once its session is revoked', async () => {
    const { authenticate, revoked } = setUp()

    await expect(authenticate('token')).resolves.not.toBeNull()
    revoked.add('session-1')

    await expect(authenticate('token')).resolves.toBeNull()
  })
})
