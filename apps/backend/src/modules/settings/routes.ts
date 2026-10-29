import { eq } from 'drizzle-orm'
import type { FastifyRequest } from 'fastify'
import type { Db } from '../../infra/db.ts'
import type { HttpServer } from '../../infra/http.ts'
import {
  defineRoute,
  registerRoutes,
  type DeclaredRoute
} from '../../infra/route.ts'
import type { Identity, RequireIdentity } from '../auth/index.ts'
import { userSettings } from './schema.ts'

export function registerSettings(
  app: HttpServer,
  deps: { db: Db; requireIdentity: RequireIdentity }
): DeclaredRoute<Identity, never>[] {
  const routes: DeclaredRoute<Identity, never>[] = [
    defineRoute({
      method: 'GET',
      url: '/settings',
      access: { on: 'self' },
      handler: async ({ identity }) => {
        const [kept] = await deps.db
          .select({
            language: userSettings.language,
            timezone: userSettings.timezone,
            theme: userSettings.theme,
            avatar: userSettings.avatar,
            name: userSettings.name
          })
          .from(userSettings)
          .where(eq(userSettings.email, identity.email.toLowerCase()))
        return {
          ok: true,
          value: {
            language: kept?.language ?? null,
            timezone: kept?.timezone ?? null,
            theme: kept?.theme ?? 'auto',
            avatar: kept?.avatar ?? null,
            name: kept?.name ?? null
          }
        }
      }
    })
  ]
  registerRoutes(
    app,
    {
      requireIdentity: deps.requireIdentity,
      identify: (request: FastifyRequest) => request.identity,
      refusalStatus: {}
    },
    routes
  )
  return routes
}
