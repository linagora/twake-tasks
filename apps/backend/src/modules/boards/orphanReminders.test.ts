import { readFileSync } from 'node:fs'
import { eq, sql as raw } from 'drizzle-orm'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTenant, migrateDb } from '../../infra/db.ts'
import { jobs } from '../../scheduler/schema.ts'
import {
  aBoardIn,
  aManagedProject,
  aUser,
  type TestUser
} from '../../testing/app.ts'
import { scheduleReminder } from './reminderJobs.ts'
import { taskReminders, tasks } from './schema.ts'

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
    '../../../drizzle/20261027215454_reminders_end_with_access/migration.sql',
    import.meta.url
  ),
  'utf8'
)
const statements = migration.split('--> statement-breakpoint')
const backfill = statements.filter(
  statement => !statement.trimStart().startsWith('ALTER POLICY')
)

async function aTaskRemindedTo(stranger: TestUser) {
  const owner = aUser({ organizationId: stranger.organizationId })
  const member = aUser({ organizationId: stranger.organizationId })
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
    return task.id
  })
  for (const user of [member, stranger]) {
    await inTenant(db, user, async tx => {
      const [reminder] = await tx
        .insert(taskReminders)
        .values({
          taskId,
          organizationId: user.organizationId,
          userId: user.userId,
          email: user.email,
          at: new Date('2099-01-01T10:00:00Z')
        })
        .returning({ id: taskReminders.id })
      if (!reminder) throw new Error('no reminder')
      await scheduleReminder(
        tx,
        {
          reminderId: reminder.id,
          taskId,
          organizationId: user.organizationId,
          userId: user.userId,
          email: user.email,
          beforeMinutes: null,
          zone: null
        },
        new Date('2099-01-01T10:00:00Z')
      )
    })
  }
  return { member, taskId }
}

const remindedOf = (taskId: string) =>
  db
    .select({ userId: raw<string>`${jobs.payload}->>'userId'` })
    .from(jobs)
    .where(eq(raw`${jobs.payload}->>'taskId'`, taskId))
    .then(rows => rows.map(row => row.userId).sort())

describe('the migration dropping reminders out of reach', () => {
  it('drops the reminders and jobs of people outside the project of their task, and only them', async () => {
    const stranger = aUser()
    const { member, taskId } = await aTaskRemindedTo(stranger)
    expect(await remindedOf(taskId)).toContain(stranger.userId)

    for (let run = 0; run < 2; run++) {
      await db.transaction(async tx => {
        for (const statement of statements) {
          await tx.execute(raw.raw(statement))
        }
      })
    }

    expect(await remindedOf(taskId)).toEqual([member.userId])
  })

  it('refuses to run as a role that owns nothing and is subject to row-level security', async () => {
    const { member, taskId } = await aTaskRemindedTo(aUser())
    await sql.unsafe(
      'grant select, delete on task_reminders, tasks, boards, project_members to outsider'
    )
    const before = await remindedOf(taskId)
    expect(before).toHaveLength(2)

    await expect(
      sql.begin(async tx => {
        await tx.unsafe('set local role outsider')
        for (const statement of backfill) await tx.unsafe(statement)
      })
    ).rejects.toThrow(/must run as the owner/)

    expect(await remindedOf(taskId)).toEqual(before)
    expect(before).toContain(member.userId)
  })
})
