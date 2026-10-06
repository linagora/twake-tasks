import type { Logger } from 'pino'
import type { Db } from './infra/db.ts'
import { createServer } from './infra/http.ts'
import {
  postgresAuthStore,
  registerAuth,
  type Authenticate,
  type IdentityProvider
} from './modules/auth/index.ts'
import { registerLive, type BoardChanges } from './modules/boards/live.ts'
import { registerBoards } from './modules/boards/routes.ts'
import { registerSettings } from './modules/settings/routes.ts'

export async function buildApp(deps: {
  logger: Logger
  db: Db
  boardChanges: BoardChanges
  provider: IdentityProvider
  authenticate: Authenticate
  isReady: () => Promise<boolean>
}) {
  const app = createServer({ logger: deps.logger, isReady: deps.isReady })
  // The frontend serves its own routes, such as /boards/<id>, on the same origin.
  await app.register(
    api => {
      const requireIdentity = registerAuth(api, {
        authenticate: deps.authenticate,
        provider: deps.provider,
        store: postgresAuthStore(deps.db)
      })
      registerBoards(api, { db: deps.db, requireIdentity })
      registerLive(api, {
        db: deps.db,
        requireIdentity,
        changes: deps.boardChanges
      })
      registerSettings(api, { db: deps.db, requireIdentity })
      return Promise.resolve()
    },
    { prefix: '/api' }
  )
  await app.ready()
  return app
}
