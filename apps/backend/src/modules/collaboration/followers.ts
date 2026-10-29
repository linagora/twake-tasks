import { and, eq } from 'drizzle-orm'
import type { Db } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { writeOrRefuse } from '../kernel/index.ts'
import { taskFollowers } from '../boards/schema.ts'
import { visibleTask } from '../tasks/index.ts'

export function createFollowerStore(db: Db) {
  return {
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
    }
  }
}
