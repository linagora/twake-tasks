import type { Redis } from 'ioredis'
import type { Logger } from 'pino'
import { versionStreams, type Changes } from './infra/changes.ts'
import type { Db } from './infra/db.ts'
import { createServer } from './infra/http.ts'
import { registerRateLimit } from './infra/rateLimit.ts'
import {
  postgresAuthStore,
  registerAuth,
  type Authenticate,
  type IdentityProvider
} from './modules/auth/index.ts'
import { registerLive } from './modules/boards/live.ts'
import { registerBoards } from './modules/boards/routes.ts'
import { registerSettings } from './modules/settings/routes.ts'

export async function buildApp(deps: {
  logger: Logger
  db: Db
  boardChanges: Changes
  provider: IdentityProvider
  authenticate: Authenticate
  searchAllowedOrigins: readonly string[]
  searchMinLength: number
  isReady: () => Promise<boolean>
  proxyHops?: number | undefined
  redis?: Redis | undefined
}) {
  const app = createServer({
    logger: deps.logger,
    isReady: deps.isReady,
    proxyHops: deps.proxyHops
  })
  await registerRateLimit(app, deps.redis)
  // The frontend serves its own routes, such as /boards/<id>, on the same origin.
  await app.register(
    api => {
      const requireIdentity = registerAuth(api, {
        authenticate: deps.authenticate,
        provider: deps.provider,
        store: postgresAuthStore(deps.db)
      })
      const streamVersions = versionStreams(api)
      registerBoards(api, {
        db: deps.db,
        requireIdentity,
        searchAllowedOrigins: deps.searchAllowedOrigins,
        searchMinLength: deps.searchMinLength
      })
      registerLive(api, {
        db: deps.db,
        requireIdentity,
        changes: deps.boardChanges,
        streamVersions
      })
      registerSettings(api, { db: deps.db, requireIdentity })
      return Promise.resolve()
    },
    { prefix: '/api' }
  )
  await app.ready()
  return app
}
