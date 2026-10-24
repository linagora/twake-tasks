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

/**
 * The task lands in the section picked, else in the default one, if the
 * board has sections.
 */
export async function createTask(
  api: BoardsApi,
  boardId: string,
  draft: NewTaskDraft
): Promise<{ boardId: string; key: string }> {
  const sectionId =
    draft.sectionId ??
    defaultSection((await api.getBoard(boardId)).sections)?.id ??
    null

  const task = await api.createTask(boardId, {
    title: draft.title.trim(),
    sectionId
  })

  const changes: TaskChanges = {
    ...(draft.priority && { priority: draft.priority }),
    ...(draft.dueDate && { dueDate: draft.dueDate })
  }
  if (Object.keys(changes).length > 0) {
    await api.editTask(boardId, task.id, changes)
  }
  if (draft.description.trim()) {
    await api.setDescription(boardId, task.id, {
      markdown: draft.description,
      version: 0
    })
  }
  if (draft.labelIds.length > 0) {
    await api.setLabels(boardId, task.id, draft.labelIds)
  }
  if (draft.assigneeIds.length > 0) {
    await api.setAssignees(boardId, task.id, draft.assigneeIds)
  }

  return { boardId, key: task.key }
}
