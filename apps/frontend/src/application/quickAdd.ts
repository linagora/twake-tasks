import type { BoardsApi, TaskChanges } from '@/application/boards'
import { parseQuickAdd } from '@/domain/quickAdd'

export type QuickAddRefusal =
  'no_title' | 'unknown_board' | 'unknown_section' | 'unknown_person'

export class QuickAddError extends Error {
  readonly code: QuickAddRefusal
  readonly typed: string | undefined

  constructor(code: QuickAddRefusal, typed?: string) {
    super(typed ? `${code}: ${typed}` : code)
    this.code = code
    this.typed = typed
  }
}

// "#product-design" finds "Product Design".
const simple = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase()

const same = (typed: string, name: string) => simple(typed) === simple(name)

/**
 * Everything the line names is found before the task is created, so a typo
 * creates nothing. Labels that do not exist yet are created.
 */
export async function quickAdd(
  api: BoardsApi,
  line: string,
  today: string
): Promise<{ boardId: string; key: string }> {
  const parsed = parseQuickAdd(line, today)
  if (!parsed.title) throw new QuickAddError('no_title')

  const { board: boardName } = parsed
  const summaries = await api.listBoards()
  const summary =
    boardName === undefined
      ? summaries.find(each => each.inbox)
      : summaries.find(
          each =>
            !each.archived &&
            (same(boardName, each.name) || same(boardName, each.keyPrefix))
        )
  if (!summary) throw new QuickAddError('unknown_board', boardName)
  const board = await api.getBoard(summary.id)

  const { section: sectionName } = parsed
  const section =
    sectionName === undefined
      ? null
      : board.sections.find(each => same(sectionName, each.name))
  if (section === undefined) {
    throw new QuickAddError('unknown_section', sectionName)
  }

  const assignees = parsed.people.map(typed => {
    const person = board.members.find(
      member =>
        same(typed, member.email) ||
        same(typed, member.email.split('@')[0] ?? '')
    )
    if (!person) throw new QuickAddError('unknown_person', typed)
    return person.userId
  })

  const task = await api.createTask(board.id, {
    title: parsed.title,
    sectionId: section?.id ?? null
  })

  const changes: TaskChanges = {
    ...(parsed.priority && { priority: parsed.priority }),
    ...(parsed.dueDate && { dueDate: parsed.dueDate }),
    ...(parsed.dueTime && { dueTime: parsed.dueTime }),
    ...(parsed.deadline && { deadline: parsed.deadline }),
    ...(parsed.duration && { duration: parsed.duration }),
    ...(parsed.recurrence && { recurrence: parsed.recurrence })
  }
  if (Object.keys(changes).length > 0) {
    await api.editTask(board.id, task.id, changes)
  }

  if (parsed.labels.length > 0) {
    const labelIds = await Promise.all(
      parsed.labels.map(
        async typed =>
          (
            board.labels.find(label => same(typed, label.name)) ??
            (await api.createLabel(board.id, typed))
          ).id
      )
    )
    await api.setLabels(board.id, task.id, labelIds)
  }

  if (assignees.length > 0) {
    await api.setAssignees(board.id, task.id, assignees)
  }

  return { boardId: board.id, key: task.key }
}
