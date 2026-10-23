import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { userSettings } from '../settings/schema.ts'
import {
  accessibleBoards,
  memberLooks,
  roleOn,
  settingsOfMember
} from './access.ts'
import { plainText } from './markdown.ts'
import { scheduleReminder, unscheduleReminder } from './reminderJobs.ts'
import {
  boards,
  comments,
  notifications,
  projectMembers,
  taskFollowers,
  taskHistory,
  taskReminders,
  tasks
} from './schema.ts'
import { Refused, refuseIfShelved, taskOf, writeOrRefuse } from './tasks.ts'

const EXCERPT_LENGTH = 120

function excerptOf(markdown: string): string {
  const chars = Array.from(plainText(markdown).replace(/\s+/g, ' ').trim())
  return chars.length > EXCERPT_LENGTH
    ? `${chars.slice(0, EXCERPT_LENGTH).join('').trimEnd()}…`
    : chars.join('')
}

export type NewReminder = { at: Date } | { beforeMinutes: number; zone: string }

const firesAt =
  sql`case when ${taskReminders.at} is not null then ${taskReminders.at}
  else reminder_time(${tasks.dueDate}, ${tasks.dueTime}, ${tasks.dueZone}, ${taskReminders.zone}, ${taskReminders.beforeMinutes}) end`.mapWith(
    taskReminders.at
  )

// Losing access drops a person's notifications, but those of a deleted space
// stay until it is purged, so they are filtered when read too.
function openableBy(tx: Tx, userId: string) {
  const accessible = accessibleBoards(tx, userId)
  return inArray(
    notifications.taskId,
    tx
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(accessible, eq(accessible.boardId, tasks.boardId))
  )
}

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
        await refuseIfShelved(tx, boardId, task)
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

    following(identity: Identity, boardId: string, taskId: string) {
      return writeOrRefuse(db, identity, async tx => {
        await visibleTask(tx, identity, boardId, taskId)
        const [row] = await tx
          .select({ taskId: taskFollowers.taskId })
          .from(taskFollowers)
          .where(
            and(
              eq(taskFollowers.taskId, taskId),
              eq(taskFollowers.userId, identity.userId)
            )
          )
        return row !== undefined
      })
    },

    setFollowing(
      identity: Identity,
      boardId: string,
      taskId: string,
      following: boolean
    ) {
      return writeOrRefuse(db, identity, async tx => {
        const task = await visibleTask(tx, identity, boardId, taskId)
        if (following) {
          await tx
            .insert(taskFollowers)
            .values({
              taskId,
              organizationId: task.organizationId,
              userId: identity.userId
            })
            .onConflictDoNothing()
        } else {
          await tx
            .delete(taskFollowers)
            .where(
              and(
                eq(taskFollowers.taskId, taskId),
                eq(taskFollowers.userId, identity.userId)
              )
            )
        }
        return null
      })
    },

    markAllRead(identity: Identity) {
      return writeOrRefuse(db, identity, async tx => {
        await tx
          .update(notifications)
          .set({ readAt: sql`now()` })
          .where(
            and(
              eq(notifications.userId, identity.userId),
              isNull(notifications.readAt),
              openableBy(tx, identity.userId)
            )
          )
        return null
      })
    },

    // One row per project with unread notifications, whatever their number.
    unreadByProject(identity: Identity) {
      return writeOrRefuse(db, identity, tx =>
        tx
          .select({ projectId: boards.projectId, count: count() })
          .from(notifications)
          .innerJoin(tasks, eq(tasks.id, notifications.taskId))
          .innerJoin(boards, eq(boards.id, tasks.boardId))
          .where(
            and(
              eq(notifications.userId, identity.userId),
              isNull(notifications.readAt),
              openableBy(tx, identity.userId)
            )
          )
          .groupBy(boards.projectId)
      )
    },

    notificationsOf(identity: Identity) {
      return writeOrRefuse(db, identity, async tx => {
        const rows = await tx
          .select({
            id: notifications.id,
            reason: notifications.reason,
            boardId: tasks.boardId,
            boardName: boards.name,
            taskId: notifications.taskId,
            key: sql<string>`${boards.keyPrefix} || '-' || ${tasks.number}`,
            title: tasks.title,
            createdAt: notifications.createdAt,
            readAt: notifications.readAt,
            actorId: notifications.actorId,
            actorEmail: sql<
              string | null
            >`coalesce(${projectMembers.email}, ${taskHistory.actorEmail}, ${comments.authorEmail})`,
            actorName: memberLooks.name,
            actorAvatar: memberLooks.avatar,
            field: taskHistory.field,
            from: taskHistory.from,
            to: taskHistory.to,
            name: taskHistory.name,
            at: taskHistory.at,
            comment: comments.body
          })
          .from(notifications)
          .innerJoin(tasks, eq(tasks.id, notifications.taskId))
          .innerJoin(boards, eq(boards.id, tasks.boardId))
          .leftJoin(taskHistory, eq(taskHistory.id, notifications.historyId))
          .leftJoin(comments, eq(comments.id, notifications.commentId))
          .leftJoin(
            projectMembers,
            and(
              eq(projectMembers.projectId, boards.projectId),
              eq(projectMembers.userId, notifications.actorId)
            )
          )
          .leftJoin(userSettings, settingsOfMember)
          .where(
            and(
              eq(notifications.userId, identity.userId),
              openableBy(tx, identity.userId)
            )
          )
          .orderBy(desc(notifications.createdAt))
          .limit(50)
        return rows.map(
          ({
            actorId,
            actorEmail,
            actorName,
            actorAvatar,
            field,
            from,
            to,
            name,
            at,
            comment,
            ...row
          }) => {
            // No actor for a reminder, nor for someone who left the project
            // once no history entry or comment still holds their email.
            const actor =
              actorId && actorEmail
                ? {
                    userId: actorId,
                    email: actorEmail,
                    name: actorName,
                    avatar: actorAvatar
                  }
                : null
            return {
              ...row,
              actor,
              change:
                actor && field !== null && at !== null
                  ? { actor, field, from, to, name, at }
                  : null,
              commentExcerpt: comment === null ? null : excerptOf(comment)
            }
          }
        )
      })
    }
  }
}
