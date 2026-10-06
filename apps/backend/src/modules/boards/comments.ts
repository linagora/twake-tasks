import { asc, eq } from 'drizzle-orm'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { namesOn, roleOn } from './access.ts'
import { comments } from './schema.ts'
import { Refused, taskOf, writeOrRefuse } from './tasks.ts'

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

export function createCommentStore(db: Db) {
  return {
    listComments(identity: Identity, boardId: string, taskId: string) {
      return writeOrRefuse(db, identity, async tx => {
        await visibleTask(tx, identity, boardId, taskId)
        const rows = await tx
          .select()
          .from(comments)
          .where(eq(comments.taskId, taskId))
          .orderBy(asc(comments.createdAt), asc(comments.id))
        const nameOf = await namesOn(tx, boardId)
        return rows.map(row => ({
          id: row.id,
          author: {
            userId: row.authorId,
            email: row.authorEmail,
            name: nameOf(row.authorId)
          },
          body: row.body,
          createdAt: row.createdAt
        }))
      })
    },

    addComment(
      identity: Identity,
      boardId: string,
      taskId: string,
      body: string
    ) {
      return writeOrRefuse(db, identity, async tx => {
        const task = await visibleTask(tx, identity, boardId, taskId)
        const [comment] = await tx
          .insert(comments)
          .values({
            taskId,
            organizationId: task.organizationId,
            authorId: identity.userId,
            authorEmail: identity.email,
            body
          })
          .returning({ id: comments.id, createdAt: comments.createdAt })
        if (!comment) throw new Error('comment insert returned nothing')
        return comment
      })
    }
  }
}
