import type { BoardsApi, TaskChanges } from '@/application/boards'
import type { BoardSummary, Priority, Section } from '@/domain/board'

export interface NewTaskDraft {
  title: string
  /** Markdown */
  description: string
  assigneeIds: string[]
  labelIds: string[]
  dueDate: string | null
  priority: Priority | null
  /** Left out, the task lands in the board's default section. */
  sectionId?: string
}

export const canAddTo = (board: BoardSummary): boolean =>
  !board.archived && board.role !== 'viewer'

/**
 * The board a task is added to unless another is picked: the one it is
 * opened from, as long as tasks can be added to it, else the Inbox.
 */
export function defaultBoard(
  summaries: BoardSummary[],
  inBoardId?: string
): BoardSummary | undefined {
  const current = summaries.find(each => each.id === inBoardId)
  return current && canAddTo(current)
    ? current
    : summaries.find(each => each.inbox)
}

/** The board's first open section, else its first one. */
export const defaultSection = <T extends Pick<Section, 'category'>>(
  sections: T[]
): T | undefined =>
  sections.find(each => each.category === 'unstarted') ?? sections[0]

export interface StartedTask {
  id: string
  key: string
}

/** The task exists, but some of its details could not be added. */
export class UnfinishedTask extends Error {
  constructor(
    readonly task: StartedTask,
    options: { cause: unknown }
  ) {
    super('The task was created without all its details', options)
  }
}

/**
 * The task lands in the section picked, else in the default one, if the
 * board has sections. Given the task an earlier call left unfinished, it
 * sets that task's details to the draft instead of creating another one.
 */
export async function createTask(
  api: BoardsApi,
  boardId: string,
  draft: NewTaskDraft,
  started?: StartedTask
): Promise<{ boardId: string; key: string }> {
  const task =
    started ??
    (await api.createTask(boardId, {
      title: draft.title.trim(),
      sectionId:
        draft.sectionId ??
        defaultSection((await api.getBoard(boardId)).sections)?.id ??
        null
    }))
  try {
    await addDetails(api, boardId, task.id, draft, started !== undefined)
  } catch (error) {
    throw new UnfinishedTask(task, { cause: error })
  }
  return { boardId, key: task.key }
}

async function addDetails(
  api: BoardsApi,
  boardId: string,
  taskId: string,
  draft: NewTaskDraft,
  finishing: boolean
): Promise<void> {
  // Finishing, any detail may already be saved, or changed since.
  const changes: TaskChanges = finishing
    ? {
        title: draft.title.trim(),
        priority: draft.priority,
        dueDate: draft.dueDate
      }
    : {
        ...(draft.priority && { priority: draft.priority }),
        ...(draft.dueDate && { dueDate: draft.dueDate })
      }
  if (Object.keys(changes).length > 0) {
    await api.editTask(boardId, taskId, changes)
  }
  const saved = finishing
    ? await api.getDescription(boardId, taskId)
    : { markdown: '', version: 0 }
  if (draft.description.trim() !== saved.markdown.trim()) {
    await api.setDescription(boardId, taskId, {
      markdown: draft.description,
      version: saved.version
    })
  }
  if (finishing || draft.labelIds.length > 0) {
    await api.setLabels(boardId, taskId, draft.labelIds)
  }
  if (finishing || draft.assigneeIds.length > 0) {
    await api.setAssignees(boardId, taskId, draft.assigneeIds)
  }
}
