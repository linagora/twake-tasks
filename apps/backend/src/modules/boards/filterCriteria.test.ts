import { readFileSync } from 'node:fs'
import { sql as raw } from 'drizzle-orm'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTenant, migrateDb } from '../../infra/db.ts'
import { aUser } from '../../testing/app.ts'
import { savedFilters } from './schema.ts'

// The migration switches row-level security off and on again for a moment,
// which locks the tables the other test files use, so it runs on a database
// of its own.
let stop: () => Promise<void>
let sql: ReturnType<typeof createDb>['sql']
let db: ReturnType<typeof createDb>['db']

beforeAll(async () => {
  const container = await new PostgreSqlContainer('postgres:18').start()
  const admin = postgres(container.getConnectionUri(), {
    onnotice: () => undefined
  })
  await admin.unsafe(`create role app login password 'app'`)
  await admin.unsafe(`create database tasks owner app`)
  await admin.end()
  const url = new URL(container.getConnectionUri())
  url.username = 'app'
  url.password = 'app'
  url.pathname = '/tasks'
  ;({ sql, db } = createDb(url.toString()))
  await migrateDb(db)
  stop = async () => {
    await sql.end()
    await container.stop()
  }
}, 120_000)

afterAll(async () => {
  await stop()
})

const statements = readFileSync(
  new URL(
    '../../../drizzle/20261024095708_filter_criteria_lists/migration.sql',
    import.meta.url
  ),
  'utf8'
).split('--> statement-breakpoint')

describe('the migration turning filter criteria into lists', () => {
  it('makes each single value a list of one, and keeps the rest', async () => {
    const owner = aUser()
    const before = [
      { assignee: 'me', priority: 1, label: 'client', due: 'week' },
      { priority: [1, 2] },
      {}
    ]
    await inTenant(db, owner, tx =>
      tx.insert(savedFilters).values(
        before.map((criteria, index) => ({
          organizationId: owner.organizationId,
          userId: owner.userId,
          name: String(index),
          criteria
        }))
      )
    )

    await db.transaction(async tx => {
      for (const statement of statements) await tx.execute(raw.raw(statement))
    })

    const after = await inTenant(db, owner, tx =>
      tx
        .select({ criteria: savedFilters.criteria })
        .from(savedFilters)
        .orderBy(savedFilters.name)
    )
    expect(after.map(row => row.criteria)).toEqual([
      { assignee: ['me'], priority: [1], label: ['client'], due: ['week'] },
      { priority: [1, 2] },
      {}
    ])
  })
})
