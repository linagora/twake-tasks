import { normalizeIP } from '@fastify/rate-limit'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { HttpServer } from '../../infra/http.ts'
import {
  IdentityProviderBusy,
  TooManyFailures,
  type Authenticate,
  type IdentityProviderGate
} from './authenticator.ts'
import type { Identity, IdentityProvider } from './oidc.ts'
import type { AuthStore } from './store.ts'

declare module 'fastify' {
  interface FastifyRequest {
    identity: Identity | null
  }
  interface FastifyContextConfig {
    // Takes the tokens of OIDC_SEARCH_AUDIENCES too.
    searchTokens?: boolean
  }
}

// Longer than any access token issued in the revoked session can live.
const REVOCATION_TTL_MS = 24 * 60 * 60 * 1000

const logoutBody = z.object({ logout_token: z.string().min(1) })

function unauthorized(reply: FastifyReply, error: string | null) {
  return reply
    .code(401)
    .header('www-authenticate', error ? `Bearer error="${error}"` : 'Bearer')
    .send({ error: 'unauthorized' })
}

const MAX_CHECKS_PER_ADDRESS = 5

function tooManyRequests(reply: FastifyReply, retryAfter: number) {
  return reply
    .code(429)
    .header('retry-after', retryAfter)
    .send({ error: 'too_many_requests' })
}

function failuresPerAddress(app: HttpServer, name: string, max: number) {
  const limit = app.createRateLimit({
    max,
    timeWindow: 60_000,
    keyGenerator: request => `${name}:${normalizeIP(request.ip)}`
  })
  return {
    async blockedFor(request: FastifyRequest): Promise<number | null> {
      const failures = await limit(request, { increment: false })
      return failures.isAllowed || failures.remaining > 0
        ? null
        : Math.max(1, failures.ttlInSeconds)
    },
    async count(request: FastifyRequest): Promise<void> {
      await limit(request)
    }
  }
}

export type RequireIdentity = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<FastifyReply | undefined>

export function registerAuth(
  app: HttpServer,
  deps: {
    authenticate: Authenticate
    provider: IdentityProvider
    store: AuthStore
  }
): RequireIdentity {
  app.decorateRequest('identity', null)
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)))
    }
  )

  // No user is known before a token is checked, so refused tokens count
  // against the caller's address.
  const accessFailures = failuresPerAddress(app, 'access-token', 30)
  const logoutFailures = failuresPerAddress(app, 'logout-token', 60)
  // Failures are counted once the SSO answers, so checks running at the same
  // time from one address are capped too.
  const checksByAddress = new Map<string, number>()

  function gateFor(request: FastifyRequest): IdentityProviderGate {
    const address = normalizeIP(request.ip)
    const leave = () => {
      const checks = (checksByAddress.get(address) ?? 1) - 1
      if (checks > 0) checksByAddress.set(address, checks)
      else checksByAddress.delete(address)
    }
    return {
      async enter() {
        const checks = checksByAddress.get(address) ?? 0
        if (checks >= MAX_CHECKS_PER_ADDRESS) return 1
        checksByAddress.set(address, checks + 1)
        const waitFor = await accessFailures.blockedFor(request)
        if (waitFor) leave()
        return waitFor
      },
      leave,
      refused: () => accessFailures.count(request)
    }
  }

  const requireIdentity: RequireIdentity = async (request, reply) => {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? []
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return unauthorized(reply, null)
    }
    let identity: Identity | null
    try {
      identity = await deps.authenticate(token, gateFor(request))
    } catch (error) {
      if (error instanceof TooManyFailures) {
        return tooManyRequests(reply, error.retryAfter)
      }
      if (error instanceof IdentityProviderBusy) {
        request.log.warn('access token checks saturated')
      } else {
        request.log.error({ err: error }, 'access token check failed')
      }
      return reply.code(503).send({ error: 'unavailable' })
    }
    if (
      !identity ||
      (identity.searchOnly && !request.routeOptions.config.searchTokens)
    ) {
      return unauthorized(reply, 'invalid_token')
    }
    request.identity = identity
  }

  app.post('/auth/backchannel-logout', async (request, reply) => {
    reply.header('cache-control', 'no-store')
    const blockedFor = await logoutFailures.blockedFor(request)
    if (blockedFor) return tooManyRequests(reply, blockedFor)
    const body = logoutBody.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'invalid_request' })
    let sessionId: string
    try {
      sessionId = await deps.provider.verifyLogoutToken(body.data.logout_token)
    } catch (error) {
      request.log.warn({ err: error }, 'logout token refused')
      await logoutFailures.count(request)
      return reply.code(400).send({ error: 'invalid_request' })
    }
    await deps.store.revoke(sessionId, new Date(Date.now() + REVOCATION_TTL_MS))
    return reply.code(200).send()
  })

  return requireIdentity
}
