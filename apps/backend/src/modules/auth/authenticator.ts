import { createHash } from 'node:crypto'
import type { Identity, IdentityProvider } from './oidc.ts'
import type { AuthStore } from './store.ts'

// Decides whether a caller may have a token checked by the SSO.
export interface IdentityProviderGate {
  // Takes the caller's place for one check, or says how many seconds to wait.
  enter: () => Promise<number | null>
  // Gives back a place enter took.
  leave: () => void
  refused: () => Promise<void>
}

export type Authenticate = (
  accessToken: string,
  gate?: IdentityProviderGate
) => Promise<Identity | null>

export class TooManyFailures extends Error {
  readonly retryAfter: number

  constructor(retryAfter: number) {
    super('too many refused tokens')
    this.retryAfter = retryAfter
  }
}

export class IdentityProviderBusy extends Error {
  constructor() {
    super('too many token checks in flight')
  }
}

const CACHE_TTL_MS = 60_000
const MAX_REFUSED = 10_000
const MAX_CHECKS_IN_FLIGHT = 50

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

export function createAuthenticator(deps: {
  provider: IdentityProvider
  store: AuthStore
  now?: () => number
}): Authenticate {
  const now = deps.now ?? Date.now
  const cache = new Map<string, { identity: Identity; until: number }>()
  // Keyed by hash and kept in order of refusal, so the oldest come first.
  const refused = new Map<string, number>()
  const inFlight = new Map<string, Promise<Identity | null>>()
  let checks = 0

  function evictExpired(at: number) {
    for (const [key, entry] of cache) {
      if (entry.until > at) break
      cache.delete(key)
    }
    for (const [key, until] of refused) {
      if (until > at) break
      refused.delete(key)
    }
  }

  async function check(
    key: string,
    accessToken: string,
    gate: IdentityProviderGate | undefined
  ): Promise<Identity | null> {
    if (checks >= MAX_CHECKS_IN_FLIGHT) throw new IdentityProviderBusy()
    checks++
    let identity: Identity | null
    try {
      identity = await deps.provider.identify(accessToken)
    } finally {
      checks--
    }
    const at = now()
    evictExpired(at)
    if (!identity) {
      if (refused.size >= MAX_REFUSED) {
        refused.delete(refused.keys().next().value as string)
      }
      refused.set(key, at + CACHE_TTL_MS)
      await gate?.refused()
      return null
    }
    cache.delete(key)
    cache.set(key, {
      identity,
      until: Math.min(identity.expiresAt.getTime(), at + CACHE_TTL_MS)
    })
    return identity
  }

  return async (accessToken, gate) => {
    const key = sha256(accessToken)
    const at = now()
    const cached = cache.get(key)
    let identity: Identity | null
    if (cached && cached.until > at) {
      identity = cached.identity
    } else if ((refused.get(key) ?? 0) > at) {
      return null
    } else {
      // Each caller is gated on its own address, even one joining a check
      // already in flight.
      const waitFor = await gate?.enter()
      if (waitFor) throw new TooManyFailures(waitFor)
      try {
        let pending = inFlight.get(key)
        if (!pending) {
          pending = check(key, accessToken, gate).finally(() => {
            inFlight.delete(key)
          })
          inFlight.set(key, pending)
        }
        identity = await pending
      } finally {
        gate?.leave()
      }
    }
    if (!identity || (await deps.store.isRevoked(identity.sessionId))) {
      return null
    }
    return identity
  }
}
