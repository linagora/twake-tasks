import { asc, eq, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { labels, taskLabels } from './schema.ts'
import {
  bumpBoard,
  checkRole,
  Refused,
  taskOf,
  writeOrRefuse
} from './tasks.ts'

interface Scope {
  spaceId: string | null
  ownerId: string | null
}

function inScope(board: Scope) {
  if (board.spaceId) return eq(labels.spaceId, board.spaceId)
  if (board.ownerId) return eq(labels.ownerId, board.ownerId)
  return sql`false`
}

export function labelsOn(tx: Tx, board: Scope) {
  return tx
    .select({ id: labels.id, name: labels.name })
    .from(labels)
    .where(inScope(board))
    .orderBy(asc(labels.name))
}

export function createLabelStore(db: Db) {
  const write = <T>(identity: Identity, work: (tx: Tx) => Promise<T>) =>
    writeOrRefuse(db, identity, work)

  return {
    createLabel(identity: Identity, boardId: string, name: string) {
      return write(identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        const board = await bumpBoard(tx, boardId)
        const [label] = await tx
          .insert(labels)
          .values({
            organizationId: board.organizationId,
            spaceId: board.spaceId,
            ownerId: board.spaceId ? null : board.ownerId,
            name
          })
          .onConflictDoNothing()
          .returning({ id: labels.id, name: labels.name })
        if (!label) throw new Refused('label_taken')
        return label
      })
    },

    setLabels(
      identity: Identity,
      boardId: string,
      taskId: string,
      labelIds: string[]
    ) {
      return write(identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        const board = await bumpBoard(tx, boardId)
        const task = await taskOf(tx, boardId, taskId)
        const available = await labelsOn(tx, board)
        if (!labelIds.every(id => available.some(label => label.id === id))) {
          throw new Refused('invalid_label')
        }
        await tx.delete(taskLabels).where(eq(taskLabels.taskId, taskId))
        if (labelIds.length > 0) {
          await tx.insert(taskLabels).values(
            [...new Set(labelIds)].map(labelId => ({
              taskId,
              labelId,
              organizationId: task.organizationId
            }))
          )
        }
        return null
      })
    }
  }
}
