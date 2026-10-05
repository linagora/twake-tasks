import type { Logger } from 'pino'
import type { Db } from './infra/db.ts'
import { createServer } from './infra/http.ts'
import {
  postgresAuthStore,
  registerAuth,
  type Authenticate,
  type IdentityProvider
} from './modules/auth/index.ts'

export async function buildApp(deps: {
  logger: Logger
  db: Db
  provider: IdentityProvider
  authenticate: Authenticate
  isReady: () => Promise<boolean>
}) {
  const app = createServer({ logger: deps.logger, isReady: deps.isReady })
  // The frontend serves its own routes, such as /boards/<id>, on the same origin.
  await app.register(
    api => {
      registerAuth(api, {
        authenticate: deps.authenticate,
        provider: deps.provider,
        store: postgresAuthStore(deps.db)
      })
      return Promise.resolve()
    },
    { prefix: '/api' }
  )
  await app.ready()
  return app
}
