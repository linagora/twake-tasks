import { and, count, eq } from 'drizzle-orm'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import {
  bumpBoard,
  checkRole,
  labelsOn,
  membersOf,
  shownTaskOf,
  taskAssignees,
  taskLabels
} from '../boards/index.ts'
import {
  Refused,
  writeOrRefuse,
  type Refusal,
  type Result
} from '../kernel/index.ts'
import { createArchiveStore } from './archive.ts'
import { createTaskStore, type TaskChanges } from './tasks.ts'
import { createTransferStore, type TransferPreview } from './transfer.ts'

// As many as one request may set on a task alone.
const MAX_LINKS = 50

interface Target {
  boardId: string
  sectionId: string | null
}

export type BulkAction =
  | { kind: 'move'; sectionId: string | null }
  | { kind: 'assign'; userId: string; assigned: boolean }
  | { kind: 'label'; labelId: string; labeled: boolean }
  | { kind: 'edit'; changes: TaskChanges }
  | { kind: 'archive' | 'trash' | 'restore' }
  | { kind: 'transfer'; to: Target }

// Each task changes in its own transaction, through the same path as a change
// of that task alone, so it gets its own history entry and notifications, and
// one refused task leaves the others changed.
async function eachTask<T>(
  taskIds: string[],
  change: (taskId: string) => Promise<Result<T>>
): Promise<{ done: T[]; failed: string[]; refusal: Refusal | null }> {
  const done: T[] = []
  const failed: string[] = []
  let refusal: Refusal | null = null
  for (const taskId of new Set(taskIds)) {
    const result = await change(taskId)
    if (result.ok) done.push(result.value)
    else {
      failed.push(taskId)
      refusal ??= result.error
    }
  }
  return { done, failed, refusal }
}

export function createBulkStore(db: Db) {
  const taskStore = createTaskStore(db)
  const archiveStore = createArchiveStore(db)
  const transferStore = createTransferStore(db)

  // Adds or removes one assignee or label, leaving the task's others as they are.
  const link = (
    identity: Identity,
    boardId: string,
    taskId: string,
    action: Extract<BulkAction, { kind: 'assign' | 'label' }>
  ) =>
    writeOrRefuse(db, identity, async (tx: Tx) => {
      await checkRole(tx, identity, boardId, 'editor')
      const board = await bumpBoard(tx, boardId)
      const task = await shownTaskOf(tx, boardId, taskId)
      if (action.kind === 'assign') {
        if (!action.assigned) {
          await tx
            .delete(taskAssignees)
            .where(
              and(
                eq(taskAssignees.taskId, taskId),
                eq(taskAssignees.userId, action.userId)
              )
            )
          return null
        }
        const members = await membersOf(tx, board)
        if (!members.some(member => member.userId === action.userId)) {
          throw new Refused('invalid_assignee')
        }
        await tx
          .insert(taskAssignees)
          .values({
            taskId,
            organizationId: task.organizationId,
            userId: action.userId
          })
          .onConflictDoNothing()
        const [assignees] = await tx
          .select({ count: count() })
          .from(taskAssignees)
          .where(eq(taskAssignees.taskId, taskId))
        if ((assignees?.count ?? 0) > MAX_LINKS) {
          throw new Refused('invalid_assignee')
        }
        return null
      }
      if (!action.labeled) {
        await tx
          .delete(taskLabels)
          .where(
            and(
              eq(taskLabels.taskId, taskId),
              eq(taskLabels.labelId, action.labelId)
            )
          )
        return null
      }
      const available = await labelsOn(tx, board)
      if (!available.some(label => label.id === action.labelId)) {
        throw new Refused('invalid_label')
      }
      await tx
        .insert(taskLabels)
        .values({
          taskId,
          labelId: action.labelId,
          organizationId: task.organizationId
        })
        .onConflictDoNothing()
      const [labeled] = await tx
        .select({ count: count() })
        .from(taskLabels)
        .where(eq(taskLabels.taskId, taskId))
      if ((labeled?.count ?? 0) > MAX_LINKS) throw new Refused('invalid_label')
      return null
    })

  const change = (
    identity: Identity,
    boardId: string,
    taskId: string,
    action: BulkAction
  ): Promise<Result<unknown>> => {
    switch (action.kind) {
      case 'move':
        return taskStore.moveTask(identity, boardId, taskId, {
          sectionId: action.sectionId
        })
      case 'assign':
      case 'label':
        return link(identity, boardId, taskId, action)
      case 'edit':
        return taskStore.editTask(identity, boardId, taskId, action.changes)
      case 'archive':
        return archiveStore.archiveTask(identity, boardId, taskId)
      case 'trash':
        return archiveStore.trashTask(identity, boardId, taskId)
      case 'restore':
        return archiveStore.restoreTask(identity, boardId, taskId)
      case 'transfer':
        return transferStore.transferTask(identity, boardId, taskId, action.to)
    }
  }

  return {
    /** Refused only when no task could be changed. */
    async changeTasks(
      identity: Identity,
      boardId: string,
      input: { taskIds: string[]; action: BulkAction }
    ): Promise<Result<{ failed: string[] }>> {
      const { done, failed, refusal } = await eachTask(input.taskIds, taskId =>
        change(identity, boardId, taskId, input.action)
      )
      return done.length === 0 && refusal
        ? { ok: false, error: refusal }
        : { ok: true, value: { failed } }
    },

    /** What moving the tasks would drop or create, each person and label once. */
    async previewTransfer(
      identity: Identity,
      boardId: string,
      input: { taskIds: string[]; to: Target }
    ): Promise<Result<TransferPreview>> {
      const { done, refusal } = await eachTask(input.taskIds, taskId =>
        transferStore.previewTransfer(identity, boardId, taskId, input.to)
      )
      if (done.length === 0 && refusal) return { ok: false, error: refusal }
      const people = new Map(
        done
          .flatMap(preview => preview.droppedAssignees)
          .map(person => [person.userId, person])
      )
      const nameOf = (person: TransferPreview['droppedAssignees'][number]) =>
        person.name ?? person.email ?? person.userId
      const labels = new Set(done.flatMap(preview => preview.createdLabels))
      return {
        ok: true,
        value: {
          droppedAssignees: [...people.values()].sort((a, b) =>
            nameOf(a).localeCompare(nameOf(b))
          ),
          createdLabels: [...labels].sort()
        }
      }
    }
  }
}
