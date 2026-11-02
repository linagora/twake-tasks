import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { oidcRevokedSessions } from './schema.ts'
import { postgresAuthStore } from './store.ts'

const { sql, db } = createDb(inject('databaseUrl'))
const store = postgresAuthStore(db)

afterAll(async () => {
  await sql.end()
})

const HOUR_MS = 60 * 60 * 1000
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR_MS)

describe('postgresAuthStore', () => {
  it('keeps a session revoked while its tokens are still checked', async () => {
    const session = randomUUID()
    await store.revoke(session, inHours(-1))

    await expect(store.isRevoked(session, inHours(48))).resolves.toBe(true)
    await store.revoke(randomUUID(), inHours(24))

    await expect(store.isRevoked(session, inHours(48))).resolves.toBe(true)
  })

  it('forgets a revoked session once its expiry passes', async () => {
    const session = randomUUID()
    await store.revoke(session, inHours(-1))

    await store.revoke(randomUUID(), inHours(24))

    await expect(store.isRevoked(session, inHours(1))).resolves.toBe(false)
  })

  it('keeps the later expiry when a session is revoked twice', async () => {
    const session = randomUUID()
    await store.revoke(session, inHours(24))
    await store.revoke(session, inHours(1))

    const [row] = await db
      .select({ expiresAt: oidcRevokedSessions.expiresAt })
      .from(oidcRevokedSessions)
      .where(eq(oidcRevokedSessions.sid, session))
    expect(row?.expiresAt.getTime()).toBeGreaterThan(inHours(23).getTime())
  })

  it('knows nothing of a session never revoked', async () => {
    await expect(store.isRevoked(randomUUID(), inHours(1))).resolves.toBe(false)
  })
})
