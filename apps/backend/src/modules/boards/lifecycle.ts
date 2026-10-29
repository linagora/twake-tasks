import {
  and,
  asc,
  eq,
  inArray,
  lt,
  ne,
  notExists,
  sql,
  type SQL,
  type SQLWrapper
} from 'drizzle-orm'
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core'
import type { Tx } from '../../infra/db.ts'
import { jobs } from '../../scheduler/schema.ts'
import {
  boards,
  commentReactions,
  notifications,
  projectMembers,
  projects,
  savedFilters,
  taskAssignees,
  taskFollowers,
  taskReminders,
  tasks
} from './schema.ts'
import { bumpProjects } from './versions.ts'

// Following, notifications, reminders and assignments end with the access that
// lets someone open a task, so that regaining it starts afresh. End access
// while the people losing it are still members, so the unassignment history
// names them, and before the change that removes access lands in history,
// which notifies the followers.

interface PerPerson {
  taskId: AnyPgColumn
  userId: AnyPgColumn
}

async function drop(tx: Tx, which: (table: PerPerson) => SQL | undefined) {
  await tx.delete(taskFollowers).where(which(taskFollowers))
  await tx.execute(sql`select set_config('app.revoking_access', 'on', true)`)
  await tx.delete(notifications).where(which(notifications))
  await tx.delete(taskReminders).where(which(taskReminders))
  await tx.execute(sql`select set_config('app.revoking_access', '', true)`)
  await tx.delete(taskAssignees).where(which(taskAssignees))
}

/** Ends the access of everyone outside the project to these tasks, which move into it. */
export async function endAccessOutside(
  tx: Tx,
  taskIds: string[] | SQLWrapper,
  projectId: string
): Promise<void> {
  await drop(tx, table =>
    and(
      inArray(table.taskId, taskIds),
      notExists(
        tx
          .select({ one: sql`1` })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, projectId),
              eq(projectMembers.userId, table.userId)
            )
          )
      )
    )
  )
}

/** Ends these people's access to the tasks of a project they are leaving. */
export async function endAccess(
  tx: Tx,
  userIds: string[],
  projectId: string
): Promise<void> {
  if (userIds.length === 0) return
  await drop(tx, table =>
    and(
      inArray(table.userId, userIds),
      inArray(
        table.taskId,
        tx
          .select({ id: tasks.id })
          .from(tasks)
          .innerJoin(boards, eq(boards.id, tasks.boardId))
          .where(eq(boards.projectId, projectId))
      )
    )
  )
}

// A project whose only admin leaves goes to its oldest editor, or is deleted.
// A managed project's members come from its integration, so it is left alone.
async function handOnProjects(tx: Tx, userId: string) {
  const otherAdmin = alias(projectMembers, 'other_admin')
  const orphaned = await tx
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(
      and(
        eq(projectMembers.userId, userId),
        eq(projectMembers.role, 'admin'),
        eq(projects.managed, false),
        notExists(
          tx
            .select()
            .from(otherAdmin)
            .where(
              and(
                eq(otherAdmin.projectId, projectMembers.projectId),
                eq(otherAdmin.role, 'admin'),
                ne(otherAdmin.userId, userId)
              )
            )
        )
      )
    )
  for (const { projectId } of orphaned) {
    const [editor] = await tx
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.role, 'editor')
        )
      )
      .orderBy(asc(projectMembers.joinedAt))
      .limit(1)
    if (editor) {
      await tx
        .update(projectMembers)
        .set({ role: 'admin' })
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, editor.userId)
          )
        )
    } else {
      await tx.delete(projects).where(eq(projects.id, projectId))
    }
  }
}

/**
 * Removes what a deleted person leaves in projects. Runs as that person, so a
 * B2C tenant shows the projects they belong to; their memberships go last,
 * since they are what makes those projects visible.
 */
export async function forgetPerson(tx: Tx, userId: string): Promise<void> {
  // While the boards are still visible through a B2C membership.
  await bumpProjects(
    tx,
    (
      await tx
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, userId))
    ).map(m => m.projectId)
  )
  await tx.delete(taskAssignees).where(eq(taskAssignees.userId, userId))
  await tx.delete(taskFollowers).where(eq(taskFollowers.userId, userId))
  await tx.delete(commentReactions).where(eq(commentReactions.userId, userId))
  await tx.delete(notifications).where(eq(notifications.userId, userId))
  await tx.delete(taskReminders).where(eq(taskReminders.userId, userId))
  await tx.delete(savedFilters).where(eq(savedFilters.userId, userId))
  await tx.delete(jobs).where(eq(jobs.userId, userId))
  await tx
    .delete(projects)
    .where(and(eq(projects.createdBy, userId), eq(projects.personal, true)))
  await handOnProjects(tx, userId)
  await tx.delete(projectMembers).where(eq(projectMembers.userId, userId))
}

/** Reaches every tenant through the `app.pruning` flag the notification policies allow. */
export async function forgetReadNotifications(
  tx: Tx,
  readBefore: Date
): Promise<void> {
  await tx.execute(sql`select set_config('app.pruning', 'on', true)`)
  await tx.delete(notifications).where(lt(notifications.readAt, readBefore))
  await tx.execute(sql`select set_config('app.pruning', '', true)`)
}

/** Erases an organization's projects, saved filters and jobs. Runs as that organization. */
export async function eraseOrganization(
  tx: Tx,
  organizationId: string
): Promise<void> {
  await tx.execute(
    sql`select set_config('app.erasing_organization', 'on', true)`
  )
  await tx.delete(projects)
  await tx.delete(savedFilters)
  await tx.execute(sql`select set_config('app.erasing_organization', '', true)`)
  await tx
    .delete(jobs)
    .where(sql`${jobs.payload}->>'organizationId' = ${organizationId}`)
}
