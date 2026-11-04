import {
  notificationPreferences,
  unsubscribeQuery
} from '@twake-tasks/api-contract'
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
import {
  keepPreferences,
  preferencesOf,
  unsubscribe
} from './notificationPreferences.ts'
import { userSettings } from './schema.ts'

export function registerSettings(
  app: HttpServer,
  deps: { db: Db; requireIdentity: RequireIdentity }
): (DeclaredRoute<Identity, never> | DeclaredRoute<null, 'not_found'>)[] {
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
    }),
    defineRoute({
      method: 'GET',
      url: '/settings/notifications',
      access: { on: 'self' },
      handler: async ({ identity }) => ({
        ok: true,
        value: await preferencesOf(deps.db, identity.userId)
      })
    }),
    defineRoute({
      method: 'PUT',
      url: '/settings/notifications',
      access: { on: 'self' },
      body: notificationPreferences,
      handler: async ({ identity, body }) => ({
        ok: true,
        value: await keepPreferences(deps.db, identity.userId, body)
      })
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
  const open: DeclaredRoute<null, 'not_found'>[] = [
    defineRoute({
      method: 'POST',
      url: '/settings/notifications/unsubscribe',
      // The token of the link stands for the session. Mail clients post
      // `List-Unsubscribe=One-Click` as a form (RFC 8058), which is ignored.
      access: { on: 'public' },
      query: unsubscribeQuery,
      status: 204,
      handler: async ({ query }) =>
        (await unsubscribe(deps.db, query.token, query.kind))
          ? { ok: true, value: undefined }
          : { ok: false, error: 'not_found' }
    })
  ]
  registerRoutes(
    app,
    {
      requireIdentity: deps.requireIdentity,
      identify: () => null,
      refusalStatus: { not_found: 404 }
    },
    open
  )
  return [...routes, ...open]
}
