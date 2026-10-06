import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { asTenant } from '../../infra/db.ts'
import type { Handler } from '../../scheduler/scheduler.ts'
import {
  boards,
  notifications,
  projectMembers,
  projects,
  tasks
} from './schema.ts'

export const NOTIFICATION_EMAIL_JOB = 'notification_email'

export interface Mail {
  to: string
  subject: string
  text: string
}

const payload = z.object({
  notificationId: z.uuid(),
  userId: z.uuid(),
  organizationId: z.string().nullable()
})

const REASONS: Record<string, string> = {
  assigned: 'You were assigned',
  mentioned: 'You were mentioned',
  following: 'Changed while you follow it',
  reminder: 'Reminder'
}

// Runs as the person notified, so nothing is sent once they can no longer
// open the task or have already read the notification in the app.
export function emailNotification(deps: {
  appUrl: string
  send: (mail: Mail) => Promise<void>
}): Handler {
  return async (raw, tx) => {
    const job = payload.parse(raw)
    await asTenant(tx, { ...job, email: '' })
    const [row] = await tx
      .select({
        reason: notifications.reason,
        boardId: boards.id,
        key: sql<string>`${boards.keyPrefix} || '-' || ${tasks.number}`,
        title: tasks.title,
        email: projectMembers.email
      })
      .from(notifications)
      .innerJoin(tasks, eq(tasks.id, notifications.taskId))
      .innerJoin(boards, eq(boards.id, tasks.boardId))
      .innerJoin(
        projects,
        and(eq(projects.id, boards.projectId), isNull(projects.deletedAt))
      )
      .innerJoin(
        projectMembers,
        and(
          eq(projectMembers.projectId, projects.id),
          eq(projectMembers.userId, job.userId)
        )
      )
      .where(
        and(
          eq(notifications.id, job.notificationId),
          isNull(notifications.readAt)
        )
      )
    if (!row) return undefined
    const link = `${deps.appUrl.replace(/\/$/, '')}/boards/${row.boardId}?task=${row.key}`
    await deps.send({
      to: row.email,
      subject: `${row.key} ${row.title}`,
      text: `${REASONS[row.reason] ?? row.reason}: ${row.key} ${row.title}\n\n${link}\n`
    })
    return undefined
  }
}
