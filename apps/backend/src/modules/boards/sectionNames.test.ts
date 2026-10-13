import { readFileSync } from 'node:fs'
import { sql as raw } from 'drizzle-orm'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTenant, migrateDb } from '../../infra/db.ts'
import { aBoardIn, aManagedProject, aUser } from '../../testing/app.ts'
import { sections } from './schema.ts'

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
    '../../../drizzle/20261013172914_sections_name_any_case/migration.sql',
    import.meta.url
  ),
  'utf8'
).split('--> statement-breakpoint')

describe('the migration making section names unique per board', () => {
  it('numbers the later sections that repeat a name, and only them', async () => {
    const owner = aUser()
    const projectId = await aManagedProject(db, [[owner, 'admin']])
    const boardId = await aBoardIn(db, owner, projectId, {
      name: 'Design',
      keyPrefix: 'DES'
    })
    const names = ['To do', 'to do', 'TO DO', 'To do (2)', 'Done']
    await sql.unsafe('drop index sections_board_id_lower_name_index')
    await inTenant(db, owner, async tx => {
      await tx.insert(sections).values(
        names.map((name, index) => ({
          boardId,
          organizationId: owner.organizationId,
          name,
          category: 'unstarted' as const,
          position: `a${String(index)}`
        }))
      )
    })

    await db.transaction(async tx => {
      for (const statement of statements) await tx.execute(raw.raw(statement))
    })

    const after = await inTenant(db, owner, tx =>
      tx
        .select({ name: sections.name })
        .from(sections)
        .where(raw`board_id = ${boardId}`)
        .orderBy(sections.position)
    )
    expect(after.map(section => section.name)).toEqual([
      'To do',
      'to do (3)',
      'TO DO (4)',
      'To do (2)',
      'Done'
    ])
  })
})
