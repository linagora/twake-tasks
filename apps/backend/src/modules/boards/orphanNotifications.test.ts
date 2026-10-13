import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { eq, sql as raw } from 'drizzle-orm'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTenant, migrateDb } from '../../infra/db.ts'
import {
  aBoardIn,
  aManagedProject,
  aUser,
  type TestUser
} from '../../testing/app.ts'
import { notifications, tasks } from './schema.ts'

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
    '../../../drizzle/20261013192144_notifications_end_with_access/migration.sql',
    import.meta.url
  ),
  'utf8'
)
const statements = migration.split('--> statement-breakpoint')
const backfill = statements.filter(
  statement => !statement.trimStart().startsWith('ALTER POLICY')
)

async function aTaskNotifying(...strangers: string[]) {
  const owner = aUser()
  const member = aUser({ organizationId: owner.organizationId })
  const projectId = await aManagedProject(db, [
    [owner, 'admin'],
    [member, 'viewer']
  ])
  const boardId = await aBoardIn(db, owner, projectId, {
    name: 'Design',
    keyPrefix: 'DES'
  })
  const taskId = await inTenant(db, owner, async tx => {
    const [task] = await tx
      .insert(tasks)
      .values({
        organizationId: owner.organizationId,
        boardId,
        number: 1,
        title: 'Logo',
        position: 'a0',
        createdBy: owner.userId
      })
      .returning({ id: tasks.id })
    if (!task) throw new Error('no task')
    await tx.insert(notifications).values(
      [member.userId, ...strangers].map(userId => ({
        taskId: task.id,
        organizationId: owner.organizationId,
        userId,
        reason: 'following'
      }))
    )
    return task.id
  })
  return { owner, member, taskId }
}

function recipientsOf(viewer: TestUser, taskId: string) {
  return inTenant(db, viewer, async tx => {
    await tx.execute(raw`select set_config('app.revoking_access', 'on', true)`)
    const rows = await tx
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(eq(notifications.taskId, taskId))
    return rows.map(row => row.userId).sort()
  })
}

describe('the migration dropping notifications out of reach', () => {
  it('drops the notifications of people outside the project of their task, and only them', async () => {
    const stranger = randomUUID()
    const { owner, member, taskId } = await aTaskNotifying(stranger)
    expect(await recipientsOf(owner, taskId)).toContain(stranger)

    for (let run = 0; run < 2; run++) {
      await db.transaction(async tx => {
        for (const statement of statements) {
          await tx.execute(raw.raw(statement))
        }
      })
    }

    expect(await recipientsOf(owner, taskId)).toEqual([member.userId])
  })

  it('refuses to run as a role that owns nothing and is subject to row-level security', async () => {
    const { owner, member, taskId } = await aTaskNotifying(randomUUID())
    await sql.unsafe(
      'grant select, delete on notifications, tasks, boards, project_members to outsider'
    )
    const before = await recipientsOf(owner, taskId)
    expect(before).toHaveLength(2)

    await expect(
      sql.begin(async tx => {
        await tx.unsafe('set local role outsider')
        for (const statement of backfill) await tx.unsafe(statement)
      })
    ).rejects.toThrow(/must run as the owner/)

    expect(await recipientsOf(owner, taskId)).toEqual(before)
    expect(before).toContain(member.userId)
  })
})
