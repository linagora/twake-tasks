import type {
  BoardsApi,
  FilterCriteria,
  TaskChanges
} from '@/application/boards'
import { openSection, viewTaskDefaults } from '@/application/viewTask'
import {
  isEditable,
  type Board,
  type BoardSummary,
  type Priority,
  type Section
} from '@/domain/board'

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
  /** A status of a view the board lacks, made as the task's section. */
  newSection?: string
  /** A label of a view the board lacks, made and given to the task. */
  newLabel?: string
}

const sameName = (a: string, b: string): boolean =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()

/**
 * What a task made in a view takes in the board it goes in, so that the view
 * shows it: the view's first person, priority, label, due date and status.
 * The label and status the board lacks are made with the task.
 */
export function viewDraft(
  criteria: FilterCriteria,
  board: Board,
  myEmail: string | null,
  today: string
): Omit<NewTaskDraft, 'title' | 'description'> {
  const { mine, priority, label, dueDate } = viewTaskDefaults(
    criteria,
    [],
    today
  )
  const person = criteria.assignees?.[0]
  const assignee = board.members.find(each =>
    mine ? each.email === myEmail : each.userId === person
  )
  const known =
    label === null
      ? undefined
      : board.labels.find(each => sameName(each.name, label))
  const status = criteria.statuses?.[0]
  const kept = board.sections.find(each =>
    criteria.statuses?.some(name => sameName(name, each.name))
  )
  const section = kept ?? (status ? undefined : openSection(board.sections))
  return {
    assigneeIds: assignee ? [assignee.userId] : [],
    labelIds: known ? [known.id] : [],
    dueDate,
    priority,
    ...(section && { sectionId: section.id }),
    ...(!kept && status?.trim() && { newSection: status.trim() }),
    ...(label !== null && !known && { newLabel: label })
  }
}

/**
 * The board a task is added to unless another is picked: the one it is
 * opened from, as long as tasks can be added to it, else the Inbox, else the
 * first one.
 */
export function defaultBoard(
  summaries: BoardSummary[],
  inBoardId?: string
): BoardSummary | undefined {
  const current = summaries.find(each => each.id === inBoardId)
  return current && isEditable(current)
    ? current
    : (summaries.find(each => each.inbox) ?? summaries[0])
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
      sectionId: await sectionOf(api, boardId, draft)
    }))
  try {
    const labelIds = await labelIdsOf(api, boardId, draft)
    await addDetails(
      api,
      boardId,
      task.id,
      { ...draft, labelIds },
      started !== undefined
    )
  } catch (error) {
    throw new UnfinishedTask(task, { cause: error })
  }
  return { boardId, key: task.key }
}

async function sectionOf(
  api: BoardsApi,
  boardId: string,
  draft: NewTaskDraft
): Promise<string | null> {
  if (draft.newSection !== undefined) {
    const made = await api.createSection(boardId, {
      name: draft.newSection,
      category: 'started'
    })
    return made.id
  }
  return (
    draft.sectionId ??
    defaultSection((await api.getBoard(boardId)).sections)?.id ??
    null
  )
}

// The label of a view the board lacks is made once: finishing the task finds
// it made.
async function labelIdsOf(
  api: BoardsApi,
  boardId: string,
  draft: NewTaskDraft
): Promise<string[]> {
  const name = draft.newLabel
  if (name === undefined) return draft.labelIds
  const known = (await api.getBoard(boardId)).labels.find(each =>
    sameName(each.name, name)
  )
  const id = known?.id ?? (await api.createLabel(boardId, { name })).id
  return [...draft.labelIds, id]
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
