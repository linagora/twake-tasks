import { eq, lt, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../infra/db.ts'
import { oidcRevokedSessions } from './schema.ts'

export interface AuthStore {
  isRevoked: (sessionId: string) => Promise<boolean>
  revoke: (sessionId: string) => Promise<void>
}

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

export async function forgetRevokedSessions(
  tx: Tx,
  revokedBefore: Date
): Promise<void> {
  await tx
    .delete(oidcRevokedSessions)
    .where(lt(oidcRevokedSessions.revokedAt, revokedBefore))
}
