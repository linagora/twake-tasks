import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { roleOn } from './access.ts'
import { scheduleReminder, unscheduleReminder } from './reminderJobs.ts'
import { boards, notifications, taskReminders, tasks } from './schema.ts'
import { Refused, taskOf, writeOrRefuse } from './tasks.ts'

export type NewReminder = { at: Date } | { beforeMinutes: number; zone: string }

const firesAt =
  sql`case when ${taskReminders.at} is not null then ${taskReminders.at}
  else reminder_time(${tasks.dueDate}, ${tasks.dueTime}, ${tasks.dueZone}, ${taskReminders.zone}, ${taskReminders.beforeMinutes}) end`.mapWith(
    taskReminders.at
  )

async function visibleTask(
  tx: Tx,
  identity: Identity,
  boardId: string,
  taskId: string
) {
  if (!(await roleOn(tx, identity.userId, boardId))) {
    throw new Refused('not_found')
  }
  return taskOf(tx, boardId, taskId)
}

// Reminders are personal: anyone who can open the board sets their own.
export function createReminderStore(db: Db) {
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
        const relative = 'beforeMinutes' in reminder
        if (relative ? task.dueDate === null : reminder.at <= new Date()) {
          throw new Refused('invalid_reminder')
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
        await unscheduleReminder(tx, reminderId)
        return null
      })
    },

    notificationsOf(identity: Identity) {
      return writeOrRefuse(db, identity, tx =>
        tx
          .select({
            id: notifications.id,
            reason: notifications.reason,
            boardId: tasks.boardId,
            taskId: notifications.taskId,
            key: sql<string>`${boards.keyPrefix} || '-' || ${tasks.number}`,
            title: tasks.title,
            createdAt: notifications.createdAt,
            readAt: notifications.readAt
          })
          .from(notifications)
          .innerJoin(tasks, eq(tasks.id, notifications.taskId))
          .innerJoin(boards, eq(boards.id, tasks.boardId))
          .where(eq(notifications.userId, identity.userId))
          .orderBy(desc(notifications.createdAt))
          .limit(50)
      )
    }
  }
}
