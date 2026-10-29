import { and, asc, eq, sql } from 'drizzle-orm'
import type { Db } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { Refused, writeOrRefuse } from '../kernel/index.ts'
import { remindersWaitingFor, scheduleReminder } from './reminderJobs.ts'
import { taskReminders, tasks } from './schema.ts'
import { refuseIfShelved, visibleTask } from './tasks.ts'

export type NewReminder = { at: Date } | { beforeMinutes: number; zone: string }

const firesAt =
  sql`case when ${taskReminders.at} is not null then ${taskReminders.at}
  else reminder_time(${tasks.dueDate}, ${tasks.dueTime}, ${tasks.dueZone}, ${taskReminders.zone}, ${taskReminders.beforeMinutes}) end`.mapWith(
    taskReminders.at
  )

// Reminders are personal: anyone who can open the board sets their own.
export function createReminderStore(db: Db, pendingReminders = 0) {
  return {
    listReminders(identity: Identity, boardId: string, taskId: string) {
      return writeOrRefuse(db, identity, async tx => {
        await visibleTask(tx, identity, boardId, taskId)
        return tx
          .select({
            id: taskReminders.id,
            at: taskReminders.at,
            beforeMinutes: taskReminders.beforeMinutes,
            firesAt
          })
          .from(taskReminders)
          .innerJoin(tasks, eq(tasks.id, taskReminders.taskId))
          .where(eq(taskReminders.taskId, taskId))
          .orderBy(asc(taskReminders.id))
      })
    },

    addReminder(
      identity: Identity,
      boardId: string,
      taskId: string,
      reminder: NewReminder
    ) {
      return writeOrRefuse(db, identity, async tx => {
        const task = await visibleTask(tx, identity, boardId, taskId)
        await refuseIfShelved(tx, boardId, task)
        const relative = 'beforeMinutes' in reminder
        if (relative ? task.dueDate === null : reminder.at <= new Date()) {
          throw new Refused('invalid_reminder')
        }
        if (
          pendingReminders > 0 &&
          (await remindersWaitingFor(tx, identity.userId)) >= pendingReminders
        ) {
          throw new Refused('too_many_reminders')
        }
        const [row] = await tx
          .insert(taskReminders)
          .values({
            taskId,
            organizationId: task.organizationId,
            userId: identity.userId,
            email: identity.email,
            ...(relative
              ? { beforeMinutes: reminder.beforeMinutes, zone: reminder.zone }
              : { at: reminder.at })
          })
          .returning({ id: taskReminders.id })
        if (!row) throw new Error('reminder insert returned nothing')
        await scheduleReminder(
          tx,
          {
            reminderId: row.id,
            taskId,
            organizationId: task.organizationId,
            userId: identity.userId,
            email: identity.email,
            beforeMinutes: relative ? reminder.beforeMinutes : null,
            zone: relative ? reminder.zone : null
          },
          relative ? null : reminder.at
        )
        return row
      })
    },

    deleteReminder(
      identity: Identity,
      boardId: string,
      taskId: string,
      reminderId: string
    ) {
      return writeOrRefuse(db, identity, async tx => {
        await visibleTask(tx, identity, boardId, taskId)
        const deleted = await tx
          .delete(taskReminders)
          .where(
            and(
              eq(taskReminders.id, reminderId),
              eq(taskReminders.taskId, taskId)
            )
          )
          .returning({ id: taskReminders.id })
        if (deleted.length === 0) throw new Refused('not_found')
        return null
      })
    }
  }
}
