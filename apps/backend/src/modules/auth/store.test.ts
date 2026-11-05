import { randomUUID } from 'node:crypto'
import { lt } from 'drizzle-orm'
import { afterAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { oidcRevokedSessions } from './schema.ts'
import { postgresAuthStore } from './store.ts'

const { sql, db } = createDb(inject('databaseUrl'))
const store = postgresAuthStore(db)

afterAll(async () => {
  await sql.end()
})

describe('postgresAuthStore', () => {
  it('keeps a session revoked for good', async () => {
    const session = randomUUID()
    await store.revoke(session)
    await store.revoke(session)

    await store.revoke(randomUUID())

    await expect(store.isRevoked(session)).resolves.toBe(true)
  })

  it('keeps a session revoked while the previous release cleans up', async () => {
    const session = randomUUID()
    await store.revoke(session)

    await db
      .delete(oidcRevokedSessions)
      .where(lt(oidcRevokedSessions.expiresAt, new Date()))

    await expect(store.isRevoked(session)).resolves.toBe(true)
  })

  it('knows nothing of a session never revoked', async () => {
    await expect(store.isRevoked(randomUUID())).resolves.toBe(false)
  })
})
