import { index, pgTable, text } from 'drizzle-orm/pg-core'
import { timestamptz } from '../../infra/db.ts'

export const oidcRevokedSessions = pgTable(
  'oidc_revoked_sessions',
  {
    sid: text().primaryKey(),
    revokedAt: timestamptz('revoked_at').notNull().defaultNow(),
    expiresAt: timestamptz('expires_at').notNull()
  },
  table => [index().on(table.expiresAt)]
)

export const wsTickets = pgTable(
  'ws_tickets',
  {
    ticketHash: text('ticket_hash').primaryKey(),
    username: text().notNull(),
    sid: text().notNull(),
    organizationId: text('organization_id').notNull(),
    tokenExpiresAt: timestamptz('token_expires_at').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    usedAt: timestamptz('used_at')
  },
  table => [index().on(table.expiresAt)]
)
