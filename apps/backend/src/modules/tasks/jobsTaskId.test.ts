import { readFileSync } from 'node:fs'
import { sql as raw } from 'drizzle-orm'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTenant, migrateDb } from '../../infra/db.ts'
import { schedule } from '../../scheduler/scheduler.ts'
import { jobs } from '../../scheduler/schema.ts'
import { aBoardIn, aManagedProject, aUser } from '../../testing/app.ts'
import { notifications, tasks } from '../boards/schema.ts'
import { PURGE_JOB } from './archive.ts'
import { REMINDER_JOB } from './reminderJobs.ts'

// The migration switches row-level security off and on again for a moment,
// which locks the tables the other test files use, so it runs on a database
// of its own.
let stop: () => Promise<void>
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
  const created = createDb(url.toString())
  db = created.db
  await migrateDb(db)
  stop = async () => {
    await created.sql.end()
    await container.stop()
  }
}, 120_000)

afterAll(async () => {
  await stop()
})

const migration = readFileSync(
  new URL(
    '../../../drizzle/20261028061314_jobs_task_id/migration.sql',
    import.meta.url
  ),
  'utf8'
)
const statements = migration.split('--> statement-breakpoint')
const backfill = statements.slice(
  statements.findIndex(statement => statement.includes('DO $$'))
)

describe('the migration giving jobs their task', () => {
  it('sets the task of the jobs scheduled before it', async () => {
    const owner = aUser()
    const projectId = await aManagedProject(db, [[owner, 'admin']])
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
      await tx.insert(notifications).values({
        taskId: task.id,
        organizationId: owner.organizationId,
        userId: owner.userId,
        reason: 'assigned'
      })
      return task.id
    })
    for (const kind of [REMINDER_JOB, PURGE_JOB]) {
      await schedule(db, {
        kind,
        payload: { taskId },
        runAt: new Date('2099-01-01T10:00:00Z')
      })
    }
    await db.update(jobs).set({ taskId: null })

    await db.transaction(async tx => {
      for (const statement of backfill) await tx.execute(raw.raw(statement))
    })

    expect(
      (await db.select({ kind: jobs.kind, taskId: jobs.taskId }).from(jobs))
        .map(job => [job.kind, job.taskId])
        .sort()
    ).toEqual([
      ['notification_email', taskId],
      [PURGE_JOB, taskId],
      [REMINDER_JOB, taskId]
    ])
  })
})
