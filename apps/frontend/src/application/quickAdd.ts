import type { BoardsApi, TaskChanges } from '@/application/boards'
import type { BoardSummary } from '@/domain/board'
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

export const same = (typed: string, name: string): boolean =>
  simple(typed) === simple(name)

export const isPerson = (typed: string, email: string): boolean =>
  same(typed, email) || same(typed, email.split('@')[0] ?? '')

export const nameHas = (name: string, typed: string): boolean =>
  simple(name).includes(simple(typed))

/** The board a line names, or the inbox when it names none. */
export function findBoard(
  summaries: BoardSummary[],
  name: string | undefined
): BoardSummary | undefined {
  return name === undefined
    ? summaries.find(each => each.inbox)
    : summaries.find(
        each =>
          !each.archived &&
          (same(name, each.name) || same(name, each.keyPrefix))
      )
}

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

  const summary = findBoard(await api.listBoards(), parsed.board)
  if (!summary) throw new QuickAddError('unknown_board', parsed.board)
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
    const person = board.members.find(member => isPerson(typed, member.email))
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
