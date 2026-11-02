import { and, eq, lt, sql } from 'drizzle-orm'
import type { Db } from '../../infra/db.ts'
import { oidcRevokedSessions } from './schema.ts'

export interface AuthStore {
  isRevoked: (sessionId: string, until: Date) => Promise<boolean>
  revoke: (sessionId: string, until: Date) => Promise<void>
}

export function postgresAuthStore(db: Db): AuthStore {
  return {
    async isRevoked(sessionId, until) {
      const [row] = await db
        .select({ expiresAt: oidcRevokedSessions.expiresAt })
        .from(oidcRevokedSessions)
        .where(eq(oidcRevokedSessions.sid, sessionId))
        .limit(1)
      if (!row) return false
      if (row.expiresAt < until) {
        await db
          .update(oidcRevokedSessions)
          .set({ expiresAt: until })
          .where(
            and(
              eq(oidcRevokedSessions.sid, sessionId),
              lt(oidcRevokedSessions.expiresAt, until)
            )
          )
      }
      return true
    },

    async revoke(sessionId, until) {
      await db.transaction(async tx => {
        await tx
          .delete(oidcRevokedSessions)
          .where(lt(oidcRevokedSessions.expiresAt, new Date()))
        await tx
          .insert(oidcRevokedSessions)
          .values({ sid: sessionId, expiresAt: until })
          .onConflictDoUpdate({
            target: oidcRevokedSessions.sid,
            set: {
              expiresAt: sql`greatest(${oidcRevokedSessions.expiresAt}, excluded.expires_at)`
            }
          })
      })
    }
  }
}
