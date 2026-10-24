import { randomUUID } from 'node:crypto'
import { sql as statement } from 'drizzle-orm'
import { afterAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../infra/db.ts'
import { postgresDeduplicator } from './dedupe.ts'

const bounded = createDb(inject('databaseUrl'), console, {
  statementTimeoutMs: 100
})

afterAll(async () => {
  await bounded.sql.end()
})

describe('the deduplicator', () => {
  it('gives an event all the time it needs, past the timeout of requests', async () => {
    const dedupe = postgresDeduplicator(bounded.db, 'test')

    const processed = await dedupe.once(
      { source: 'test', id: randomUUID() },
      async tx => {
        await tx.execute(statement`select pg_sleep(0.3)`)
      }
    )

    expect(processed).toBe(true)
  })
})
