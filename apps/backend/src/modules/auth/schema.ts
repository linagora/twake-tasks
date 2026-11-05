import { pgTable, text } from 'drizzle-orm/pg-core'
import { timestamptz } from '../../infra/db.ts'

export const oidcRevokedSessions = pgTable('oidc_revoked_sessions', {
  sid: text().primaryKey(),
  revokedAt: timestamptz('revoked_at').notNull().defaultNow(),
  // Unused, kept for the replicas of the previous release.
  expiresAt: timestamptz('expires_at')
})
