import { and, asc, eq, ne, notInArray, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { tellBoardChanged } from './live.ts'
import { boards, labels, taskLabels } from './schema.ts'
import {
  bumpBoard,
  checkRole,
  isUniqueViolation,
  Refused,
  taskOf,
  writeOrRefuse,
  type Result
} from './tasks.ts'

const shape = { id: labels.id, name: labels.name, color: labels.color }

export function labelsOn(tx: Tx, board: { projectId: string }) {
  return tx
    .select(shape)
    .from(labels)
    .where(eq(labels.projectId, board.projectId))
    .orderBy(asc(labels.name))
}

export function createLabelStore(db: Db) {
  const write = <T>(identity: Identity, work: (tx: Tx) => Promise<T>) =>
    writeOrRefuse(db, identity, work)

  return {
    createLabel(
      identity: Identity,
      boardId: string,
      input: { name: string; color?: string | null | undefined }
    ) {
      return write(identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        const board = await bumpBoard(tx, boardId)
        const [label] = await tx
          .insert(labels)
          .values({
            organizationId: board.organizationId,
            projectId: board.projectId,
            name: input.name,
            color: input.color ?? null
          })
          .onConflictDoNothing()
          .returning(shape)
        if (!label) throw new Refused('label_taken')
        return label
      })
    },

    async editLabel(
      identity: Identity,
      boardId: string,
      labelId: string,
      changes: { name?: string | undefined; color?: string | null | undefined }
    ): Promise<Result<{ id: string; name: string; color: string | null }>> {
      try {
        return await write(identity, async tx => {
          await checkRole(tx, identity, boardId, 'editor')
          // The label shows on every board of the project, so each one's
          // live viewers have to reload. Locking them all in id order first
          // keeps two edits from different boards from deadlocking.
          const [owner] = await tx
            .select({ projectId: boards.projectId })
            .from(boards)
            .where(eq(boards.id, boardId))
          if (!owner) throw new Refused('not_found')
          await tx
            .select({ id: boards.id })
            .from(boards)
            .where(eq(boards.projectId, owner.projectId))
            .orderBy(asc(boards.id))
            .for('update')
          const board = await bumpBoard(tx, boardId)
          const [label] = await tx
            .update(labels)
            .set(changes)
            .where(
              and(eq(labels.id, labelId), eq(labels.projectId, board.projectId))
            )
            .returning(shape)
          if (!label) throw new Refused('not_found')
          const siblings = await tx
            .update(boards)
            .set({ version: sql`${boards.version} + 1` })
            .where(
              and(eq(boards.projectId, board.projectId), ne(boards.id, boardId))
            )
            .returning({ id: boards.id, version: boards.version })
          for (const sibling of siblings) tellBoardChanged(tx, sibling)
          return label
        })
      } catch (error) {
        if (isUniqueViolation(error)) return { ok: false, error: 'label_taken' }
        throw error
      }
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
        await tx
          .delete(taskLabels)
          .where(
            and(
              eq(taskLabels.taskId, taskId),
              notInArray(taskLabels.labelId, labelIds)
            )
          )
        if (labelIds.length > 0) {
          await tx
            .insert(taskLabels)
            .values(
              [...new Set(labelIds)].map(labelId => ({
                taskId,
                labelId,
                organizationId: task.organizationId
              }))
            )
            .onConflictDoNothing()
        }
        return null
      })
    }
  }
}
