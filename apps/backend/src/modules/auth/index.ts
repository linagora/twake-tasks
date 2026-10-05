import type { Db } from '../../infra/db.ts'
import type { HttpServer } from '../../infra/http.ts'
import { createAuthenticator } from './authenticator.ts'
import { discoverIdentityProvider, type OidcOptions } from './oidc.ts'
import { registerAuth, type RequireIdentity } from './routes.ts'
import { postgresAuthStore } from './store.ts'

export type { Identity } from './oidc.ts'
export type { RequireIdentity } from './routes.ts'

export async function setUpAuth(
  app: HttpServer,
  deps: { db: Db; oidc: OidcOptions }
): Promise<RequireIdentity> {
  const provider = await discoverIdentityProvider(deps.oidc)
  const store = postgresAuthStore(deps.db)
  return registerAuth(app, {
    provider,
    store,
    authenticate: createAuthenticator({ provider, store })
  })
}
