import { and, asc, count, eq } from 'drizzle-orm'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { roleOn } from './access.ts'
import { boards, taskFiles, tasks } from './schema.ts'
import { checkRole, Refused, taskOf, writeOrRefuse } from './tasks.ts'

export const MAX_FILES_PER_TASK = 50

export interface NewTaskFile {
  url: string
  name: string
  mimeType: string | null
  size: number | null
  driveFileId: string | null
}

// Adding or removing a link changes the task: for its editors, while it is open.
async function editableTask(
  tx: Tx,
  identity: Identity,
  boardId: string,
  taskId: string
) {
  await checkRole(tx, identity, boardId, 'editor')
  const task = await taskOf(tx, boardId, taskId)
  const [board] = await tx
    .select({ archivedAt: boards.archivedAt })
    .from(boards)
    .where(eq(boards.id, boardId))
  if (board?.archivedAt || task.archivedAt || task.deletedAt) {
    throw new Refused('archived')
  }
  return task
}

const shown = (row: typeof taskFiles.$inferSelect) => ({
  id: row.id,
  url: row.url,
  name: row.name,
  mimeType: row.mimeType,
  size: row.size,
  addedBy: row.addedBy,
  createdAt: row.createdAt
})

export function createFileStore(db: Db) {
  return {
    listFiles(identity: Identity, boardId: string, taskId: string) {
      return writeOrRefuse(db, identity, async tx => {
        if (!(await roleOn(tx, identity.userId, boardId))) {
          throw new Refused('not_found')
        }
        await taskOf(tx, boardId, taskId)
        const rows = await tx
          .select()
          .from(taskFiles)
          .where(eq(taskFiles.taskId, taskId))
          .orderBy(asc(taskFiles.createdAt), asc(taskFiles.id))
        return rows.map(shown)
      })
    },

    addFiles(
      identity: Identity,
      boardId: string,
      taskId: string,
      files: NewTaskFile[]
    ) {
      return writeOrRefuse(db, identity, async tx => {
        const task = await editableTask(tx, identity, boardId, taskId)
        // Locks the task, so two batches cannot both pass the limit.
        await tx
          .select({ id: tasks.id })
          .from(tasks)
          .where(eq(tasks.id, taskId))
          .for('update')
        const [held] = await tx
          .select({ count: count() })
          .from(taskFiles)
          .where(eq(taskFiles.taskId, taskId))
        if ((held?.count ?? 0) + files.length > MAX_FILES_PER_TASK) {
          throw new Refused('too_many_files')
        }
        const rows = await tx
          .insert(taskFiles)
          .values(
            files.map(file => ({
              ...file,
              taskId,
              organizationId: task.organizationId,
              addedBy: identity.userId
            }))
          )
          .returning()
        return rows.map(shown)
      })
    },

    removeFile(
      identity: Identity,
      boardId: string,
      taskId: string,
      fileId: string
    ) {
      return writeOrRefuse(db, identity, async tx => {
        await editableTask(tx, identity, boardId, taskId)
        const [removed] = await tx
          .delete(taskFiles)
          .where(and(eq(taskFiles.id, fileId), eq(taskFiles.taskId, taskId)))
          .returning({ id: taskFiles.id })
        if (!removed) throw new Refused('not_found')
      })
    }
  }
}
