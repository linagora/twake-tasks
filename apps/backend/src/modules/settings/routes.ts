import { eq } from 'drizzle-orm'
import type { Db } from '../../infra/db.ts'
import type { HttpServer } from '../../infra/http.ts'
import type { RequireIdentity } from '../auth/index.ts'
import { userSettings } from './schema.ts'

export function registerSettings(
  app: HttpServer,
  deps: { db: Db; requireIdentity: RequireIdentity }
) {
  app.get(
    '/settings',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
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
        language: kept?.language ?? null,
        timezone: kept?.timezone ?? null,
        theme: kept?.theme ?? 'auto',
        avatar: kept?.avatar ?? null,
        name: kept?.name ?? null
      }
    }
  )
}
