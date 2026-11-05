import type {
  BoardsApi,
  NewReminder,
  Reminder,
  TaskChanges
} from '@/application/boards'
import {
  isEditable,
  type BoardSummary,
  type Priority,
  type Recurrence,
  type Section
} from '@/domain/board'

export interface NewTaskDraft {
  title: string
  /** Markdown */
  description: string
  assigneeIds: string[]
  labelIds: string[]
  dueDate: string | null
  dueTime: string | null
  dueZone: string | null
  recurrence: Recurrence | null
  reminders: NewReminder[]
  priority: Priority | null
  /** Left out, the task lands in the board's default section. */
  sectionId?: string
  /** The template the draft was filled from, which the task links to. */
  templateId?: string
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
      sectionId:
        draft.sectionId ??
        defaultSection((await api.getBoard(boardId)).sections)?.id ??
        null,
      ...(draft.templateId && { templateId: draft.templateId })
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
        dueDate: draft.dueDate,
        dueTime: draft.dueTime,
        dueZone: draft.dueZone,
        recurrence: draft.recurrence
      }
    : {
        ...(draft.priority && { priority: draft.priority }),
        ...(draft.dueDate && { dueDate: draft.dueDate }),
        ...(draft.dueTime && { dueTime: draft.dueTime }),
        ...(draft.dueZone && { dueZone: draft.dueZone }),
        ...(draft.recurrence && { recurrence: draft.recurrence })
      }
  if (Object.keys(changes).length > 0) {
    await api.editTask(boardId, taskId, changes)
  }
  // After the due date is saved: a reminder before it needs one.
  const added = finishing ? await api.listReminders(boardId, taskId) : []
  const same = (each: Reminder, reminder: NewReminder) =>
    'at' in reminder
      ? each.at === reminder.at
      : each.beforeMinutes === reminder.beforeMinutes
  for (const each of added) {
    if (!draft.reminders.some(reminder => same(each, reminder))) {
      await api.deleteReminder(boardId, taskId, each.id)
    }
  }
  for (const reminder of draft.reminders) {
    if (!added.some(each => same(each, reminder))) {
      await api.addReminder(boardId, taskId, reminder)
    }
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
