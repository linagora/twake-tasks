import { and, eq, inArray, notExists, sql, type SQLWrapper } from 'drizzle-orm'
import type { Tx } from '../../infra/db.ts'
import { boards, projectMembers, taskFollowers, tasks } from './schema.ts'

// Following a task means being notified of it, so it ends with the access
// that lets someone open it. Run it before the change that removes access
// lands in history, which notifies the followers.

/** Stops these tasks being followed by anyone outside the project. */
export async function unfollowOutside(
  tx: Tx,
  taskIds: string[] | SQLWrapper,
  projectId: string
): Promise<void> {
  await tx.delete(taskFollowers).where(
    and(
      inArray(taskFollowers.taskId, taskIds),
      notExists(
        tx
          .select({ one: sql`1` })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, projectId),
              eq(projectMembers.userId, taskFollowers.userId)
            )
          )
      )
    )
  )
}

/** Stops these people following the tasks of a project they are leaving. */
export async function unfollowProject(
  tx: Tx,
  userIds: string[],
  projectId: string
): Promise<void> {
  if (userIds.length === 0) return
  await tx
    .delete(taskFollowers)
    .where(
      and(
        inArray(taskFollowers.userId, userIds),
        inArray(
          taskFollowers.taskId,
          tx
            .select({ id: tasks.id })
            .from(tasks)
            .innerJoin(boards, eq(boards.id, tasks.boardId))
            .where(eq(boards.projectId, projectId))
        )
      )
    )
}
