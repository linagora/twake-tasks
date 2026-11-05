import { eq } from 'drizzle-orm'
import type { Db } from '../../infra/db.ts'
import { oidcRevokedSessions } from './schema.ts'

export interface AuthStore {
  isRevoked: (sessionId: string) => Promise<boolean>
  revoke: (sessionId: string) => Promise<void>
}

// A revocation is never forgotten: a token issued for the session, or
// refreshed under it, can turn up at any time.
export function postgresAuthStore(db: Db): AuthStore {
  return {
    async isRevoked(sessionId) {
      const [row] = await db
        .select({ sid: oidcRevokedSessions.sid })
        .from(oidcRevokedSessions)
        .where(eq(oidcRevokedSessions.sid, sessionId))
        .limit(1)
      return row !== undefined
    },

    async revoke(sessionId) {
      await db
        .insert(oidcRevokedSessions)
        .values({ sid: sessionId })
        .onConflictDoNothing()
    }
  }
}
