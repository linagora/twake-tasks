import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import {
  accessibleBoards,
  memberLooks,
  memberNames,
  settingsOfMember
} from '../boards/access.ts'
import {
  boards,
  comments,
  notifications,
  projectMembers,
  taskHistory,
  tasks
} from '../boards/schema.ts'
import { Refused, writeOrRefuse } from '../kernel/index.ts'
import { userSettings } from '../settings/index.ts'
import { mentionedEmails, plainText, withNames } from '../tasks/index.ts'

const EXCERPT_LENGTH = 120

function excerptOf(text: string): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim())
  return chars.length > EXCERPT_LENGTH
    ? `${chars.slice(0, EXCERPT_LENGTH).join('').trimEnd()}…`
    : chars.join('')
}

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

export function createNotificationStore(db: Db) {
  return {
    markAllRead(identity: Identity, ids?: string[]) {
      return writeOrRefuse(db, identity, async tx => {
        await tx
          .update(notifications)
          .set({ readAt: sql`now()` })
          .where(
            and(
              eq(notifications.userId, identity.userId),
              isNull(notifications.readAt),
              openableBy(tx, identity.userId),
              ids && inArray(notifications.id, ids)
            )
          )
        return null
      })
    },

    markRead(identity: Identity, notificationId: string) {
      return writeOrRefuse(db, identity, async tx => {
        const [marked] = await tx
          .update(notifications)
          .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
          .where(
            and(
              eq(notifications.id, notificationId),
              eq(notifications.userId, identity.userId),
              openableBy(tx, identity.userId)
            )
          )
          .returning({ id: notifications.id })
        if (!marked) throw new Refused('not_found')
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
            projectId: boards.projectId,
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
        const quoted = rows.map(({ comment, ...row }) => ({
          ...row,
          quote: comment === null ? null : plainText(comment)
        }))
        const nameOf = await memberNames(
          tx,
          quoted.map(row => row.projectId),
          quoted.flatMap(({ quote }) =>
            quote ? [...mentionedEmails(quote)] : []
          )
        )
        return quoted.map(
          ({
            projectId,
            actorId,
            actorEmail,
            actorName,
            actorAvatar,
            field,
            from,
            to,
            name,
            at,
            quote,
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
              commentExcerpt:
                quote === null
                  ? null
                  : excerptOf(
                      withNames(quote, email => nameOf(projectId, email))
                    )
            }
          }
        )
      })
    }
  }
}
