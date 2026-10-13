import {
  and,
  eq,
  inArray,
  notExists,
  sql,
  type SQL,
  type SQLWrapper
} from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { Tx } from '../../infra/db.ts'
import {
  boards,
  notifications,
  projectMembers,
  taskFollowers,
  tasks
} from './schema.ts'

// Following a task and its notifications end with the access that lets
// someone open it, so that regaining it starts afresh. Run it before the
// change that removes access lands in history, which notifies the followers.

interface PerPerson {
  taskId: AnyPgColumn
  userId: AnyPgColumn
}

async function drop(tx: Tx, which: (table: PerPerson) => SQL | undefined) {
  await tx.delete(taskFollowers).where(which(taskFollowers))
  await tx.execute(sql`select set_config('app.revoking_access', 'on', true)`)
  await tx.delete(notifications).where(which(notifications))
  await tx.execute(sql`select set_config('app.revoking_access', '', true)`)
}

/** Stops these tasks being followed by, or notifying, anyone outside the project. */
export async function revokeOutside(
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

/** Stops these people following, or being notified of, the tasks of a project they are leaving. */
export async function revokeProject(
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
