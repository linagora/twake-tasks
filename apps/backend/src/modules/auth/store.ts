import { eq, lt } from 'drizzle-orm'
import type { Db } from '../../infra/db.ts'
import { oidcRevokedSessions, wsTickets } from './schema.ts'

export interface Ticket {
  hash: string
  email: string
  sessionId: string
  organizationId: string
  tokenExpiresAt: Date
  expiresAt: Date
}

export interface AuthStore {
  isRevoked: (sessionId: string) => Promise<boolean>
  revoke: (sessionId: string, until: Date) => Promise<void>
  saveTicket: (ticket: Ticket) => Promise<void>
}

export function postgresAuthStore(db: Db): AuthStore {
  return {
    async isRevoked(sessionId) {
      const rows = await db
        .select({ sid: oidcRevokedSessions.sid })
        .from(oidcRevokedSessions)
        .where(eq(oidcRevokedSessions.sid, sessionId))
        .limit(1)
      return rows.length > 0
    },

    async revoke(sessionId, until) {
      await db.transaction(async tx => {
        await tx
          .delete(oidcRevokedSessions)
          .where(lt(oidcRevokedSessions.expiresAt, new Date()))
        await tx
          .insert(oidcRevokedSessions)
          .values({ sid: sessionId, expiresAt: until })
          .onConflictDoNothing()
      })
    },

    async saveTicket(ticket) {
      await db.transaction(async tx => {
        await tx.delete(wsTickets).where(lt(wsTickets.expiresAt, new Date()))
        await tx.insert(wsTickets).values({
          ticketHash: ticket.hash,
          username: ticket.email,
          sid: ticket.sessionId,
          organizationId: ticket.organizationId,
          tokenExpiresAt: ticket.tokenExpiresAt,
          expiresAt: ticket.expiresAt
        })
      })
    }
  }
}
