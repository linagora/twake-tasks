import type { Redis } from 'ioredis'
import type { Logger } from 'pino'
import { boardBudgets } from './budgets.ts'
import type { RateLimits } from './config.ts'
import { versionStreams, type Changes } from './infra/changes.ts'
import type { Db } from './infra/db.ts'
import { createServer } from './infra/http.ts'
import type { Metrics } from './infra/metrics.ts'
import { registerRateLimit } from './infra/rateLimit.ts'
import {
  limitUsers,
  postgresAuthStore,
  registerAuth,
  type Authenticate,
  type IdentityProvider
} from './modules/auth/index.ts'
import { registerLive } from './modules/boards/liveRoutes.ts'
import { registerBoards } from './modules/boards/routes.ts'
import { registerCollaboration } from './modules/collaboration/index.ts'
import { registerNotifications } from './modules/notifications/index.ts'
import { registerProjects } from './modules/projects/index.ts'
import { registerSettings } from './modules/settings/index.ts'
import { registerViews } from './modules/views/index.ts'

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
  metrics?: Metrics | undefined
  // Without them, nothing is limited per user.
  limits?:
    | Pick<
        RateLimits,
        | 'user'
        | 'openStreams'
        | 'address'
        | 'mentionsPerComment'
        | 'pendingReminders'
      >
    | undefined
}) {
  const app = createServer({
    logger: deps.logger,
    isReady: deps.isReady,
    proxyHops: deps.proxyHops,
    metrics: deps.metrics
  })
  await registerRateLimit(app, deps.redis)
  // The frontend serves its own routes, such as /boards/<id>, on the same origin.
  await app.register(
    api => {
      const { requireIdentity } = registerAuth(api, {
        authenticate: deps.authenticate,
        provider: deps.provider,
        store: postgresAuthStore(deps.db),
        addressLimits: deps.limits?.address,
        limitUser:
          deps.limits && limitUsers(api, deps.limits.user, boardBudgets)
      })
      const streamVersions = versionStreams(api)
      registerProjects(api, { db: deps.db, requireIdentity })
      registerBoards(api, {
        db: deps.db,
        requireIdentity,
        pendingReminders: deps.limits?.pendingReminders ?? 0
      })
      registerCollaboration(api, {
        db: deps.db,
        requireIdentity,
        mentionsPerComment: deps.limits?.mentionsPerComment ?? 0
      })
      registerLive(api, {
        db: deps.db,
        requireIdentity,
        changes: deps.boardChanges,
        streamVersions,
        openStreams: deps.limits?.openStreams,
        metrics: deps.metrics
      })
      registerViews(api, {
        db: deps.db,
        requireIdentity,
        searchAllowedOrigins: deps.searchAllowedOrigins,
        searchMinLength: deps.searchMinLength
      })
      registerNotifications(api, { db: deps.db, requireIdentity })
      registerSettings(api, { db: deps.db, requireIdentity })
      return Promise.resolve()
    },
    { prefix: '/api' }
  )
  await app.ready()
  return app
}
