import { readFileSync } from 'node:fs'
import { asc, eq, sql as raw } from 'drizzle-orm'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTenant, migrateDb, type Tx } from '../../infra/db.ts'
import { aB2cUser, aUser, type TestUser } from '../../testing/app.ts'
import { boards, projects, tasks } from './schema.ts'

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
  await admin.unsafe(`create role outsider nologin`)
  await admin.unsafe(`grant outsider to app`)
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

const migration = readFileSync(
  new URL(
    '../../../drizzle/20261028084023_key_prefix_per_organization/migration.sql',
    import.meta.url
  ),
  'utf8'
)
const statements = migration.split('--> statement-breakpoint')

const DROP_INDEX = 'drop index if exists boards_key_prefix_per_organization'

// The prefixes are created before the index, as they were before it existed.
async function aBoardEach(
  tx: Tx,
  owner: TestUser,
  keyPrefixes: string[]
): Promise<string[]> {
  const ids: string[] = []
  for (const keyPrefix of keyPrefixes) {
    const [project] = await tx
      .insert(projects)
      .values({
        organizationId: owner.organizationId,
        name: keyPrefix,
        createdBy: owner.userId
      })
      .returning({ id: projects.id })
    if (!project) throw new Error('no project')
    const [board] = await tx
      .insert(boards)
      .values({
        organizationId: owner.organizationId,
        projectId: project.id,
        name: keyPrefix,
        keyPrefix,
        createdBy: owner.userId
      })
      .returning({ id: boards.id })
    if (!board) throw new Error('no board')
    await tx.insert(tasks).values({
      organizationId: owner.organizationId,
      boardId: board.id,
      number: 1,
      title: 'Logo',
      position: 'a0',
      createdBy: owner.userId
    })
    ids.push(board.id)
  }
  return ids
}

async function prefixesOf(owner: TestUser, ids: string[]) {
  return inTenant(db, owner, async tx => {
    const prefixes: string[] = []
    for (const id of ids) {
      const [board] = await tx
        .select({ keyPrefix: boards.keyPrefix })
        .from(boards)
        .where(eq(boards.id, id))
      prefixes.push(board?.keyPrefix ?? '')
    }
    return prefixes
  })
}

async function previousKeysOf(owner: TestUser, boardId: string) {
  return inTenant(db, owner, async tx =>
    tx
      .select({ previousKeys: tasks.previousKeys })
      .from(tasks)
      .where(eq(tasks.boardId, boardId))
      .orderBy(asc(tasks.number))
      .then(rows => rows.map(row => row.previousKeys))
  )
}

describe('the migration making key prefixes unique in an organization', () => {
  it('renames every board but the oldest of a prefix to a free one, and keeps the former keys of its tasks', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const elsewhere = aUser()
    const b2c = aB2cUser()

    await sql.unsafe(DROP_INDEX)
    const ids = await inTenant(db, alice, tx =>
      aBoardEach(tx, alice, ['DES', 'DES', 'DES2', 'ABCDEFGHIJ'])
    )
    const bobs = await inTenant(db, bob, tx =>
      aBoardEach(tx, bob, ['DES', 'ABCDEFGHIJ'])
    )
    const others = await inTenant(db, elsewhere, tx =>
      aBoardEach(tx, elsewhere, ['DES'])
    )
    const b2cs = await inTenant(db, b2c, tx => aBoardEach(tx, b2c, ['DES']))

    for (let run = 0; run < 2; run++) {
      await db.transaction(async tx => {
        if (run > 0) await tx.execute(raw.raw(DROP_INDEX))
        for (const statement of statements) {
          await tx.execute(raw.raw(statement))
        }
      })
    }

    expect(await prefixesOf(alice, [...ids, ...bobs])).toEqual([
      'DES',
      'DES3',
      'DES2',
      'ABCDEFGHIJ',
      'DES4',
      'ABCDEFGHI2'
    ])
    expect(await previousKeysOf(alice, ids[0] ?? '')).toEqual([[]])
    expect(await previousKeysOf(bob, bobs[0] ?? '')).toEqual([['DES-1']])
    expect(await prefixesOf(elsewhere, others)).toEqual(['DES'])
    expect(await prefixesOf(b2c, b2cs)).toEqual(['DES'])
  })

  it('refuses to run as a role that owns nothing and is subject to row-level security', async () => {
    await sql.unsafe('grant select, update on boards, tasks to outsider')

    await expect(
      sql.begin(async tx => {
        await tx.unsafe('set local role outsider')
        for (const statement of statements) await tx.unsafe(statement)
      })
    ).rejects.toThrow(/must run as the owner/)
  })
})
