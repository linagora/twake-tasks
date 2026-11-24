import { eq, sql } from 'drizzle-orm'
import type { Db } from '../../infra/db.ts'
import { oidcRevokedSessions } from './schema.ts'

export interface AuthStore {
  isRevoked: (sessionId: string) => Promise<boolean>
  revoke: (sessionId: string) => Promise<void>
}

// A revocation is never forgotten: a token issued for the session, or
// refreshed under it, can turn up at any time.
export function postgresAuthStore(db: Db): AuthStore {
  // Every request looks its session up, so the query is built once.
  const revoked = db
    .select({ sid: oidcRevokedSessions.sid })
    .from(oidcRevokedSessions)
    .where(eq(oidcRevokedSessions.sid, sql.placeholder('sessionId')))
    .limit(1)
    .prepare('is_revoked')
  return {
    async isRevoked(sessionId) {
      const [row] = await revoked.execute({ sessionId })
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
