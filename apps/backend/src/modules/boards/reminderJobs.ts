import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { asTenant, type Tx } from '../../infra/db.ts'
import type { Handler } from '../../scheduler/scheduler.ts'
import { jobs } from '../../scheduler/schema.ts'
import { notifications, taskReminders, tasks } from './schema.ts'

export const REMINDER_JOB = 'reminder'

const payload = z.object({
  reminderId: z.uuid(),
  taskId: z.uuid(),
  organizationId: z.string().nullable(),
  userId: z.uuid(),
  email: z.string(),
  beforeMinutes: z.int().nullable(),
  zone: z.string().nullable()
})

type Payload = z.infer<typeof payload>

const keyOf = (reminderId: string) => `${REMINDER_JOB}:${reminderId}`

// A reminder whose time has passed waits, in case the due date moves again.
const runAt = (time: ReturnType<typeof sql>) =>
  sql`coalesce(case when ${time} > now() then ${time} end, 'infinity')`

const relativeTime = (task: typeof tasks, job: typeof jobs) =>
  sql`reminder_time(${task.dueDate}, ${task.dueTime}, ${task.dueZone}, ${job.payload}->>'zone', (${job.payload}->>'beforeMinutes')::int)`

export async function scheduleReminder(tx: Tx, job: Payload, at: Date | null) {
  const value = sql`${JSON.stringify(job)}::jsonb`
  const time = at
    ? sql`${at.toISOString()}::timestamptz`
    : sql`(select reminder_time(${tasks.dueDate}, ${tasks.dueTime}, ${tasks.dueZone}, ${job.zone}, ${job.beforeMinutes}) from ${tasks} where ${tasks.id} = ${job.taskId})`
  await tx.insert(jobs).values({
    kind: REMINDER_JOB,
    key: keyOf(job.reminderId),
    payload: value,
    runAt: runAt(time)
  })
}

export async function unscheduleReminder(tx: Tx, reminderId: string) {
  await tx.delete(jobs).where(eq(jobs.key, keyOf(reminderId)))
}

// Every relative reminder of the task follows its due date, whoever set it.
export async function moveReminders(tx: Tx, taskId: string) {
  await tx
    .update(jobs)
    .set({ runAt: runAt(relativeTime(tasks, jobs)) })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(jobs.kind, REMINDER_JOB),
        sql`${jobs.payload}->>'taskId' = ${taskId}`,
        sql`${jobs.payload}->>'beforeMinutes' is not null`
      )
    )
}

// Runs as the person the reminder is for, so it fires only while they can
// still open the task. A relative reminder then waits for the next due date.
export const deliverReminder: Handler = async (raw, tx) => {
  const job = payload.parse(raw)
  await asTenant(tx, job)
  const [reminder] = await tx
    .select({ id: taskReminders.id })
    .from(taskReminders)
    .where(eq(taskReminders.id, job.reminderId))
  if (!reminder) return undefined
  await tx.insert(notifications).values({
    taskId: job.taskId,
    organizationId: job.organizationId,
    userId: job.userId,
    reason: 'reminder'
  })
  if (job.beforeMinutes === null) return undefined
  await tx
    .update(jobs)
    .set({ runAt: sql`'infinity'` })
    .where(eq(jobs.key, keyOf(job.reminderId)))
  return 'keep'
}
