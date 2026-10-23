import type { BoardsApi, TaskChanges } from '@/application/boards'
import { deadlineBeforeDue, type BoardSummary } from '@/domain/board'
import { parseQuickAdd } from '@/domain/quickAdd'

export type QuickAddRefusal =
  | 'no_title'
  | 'unknown_board'
  | 'unknown_section'
  | 'unknown_person'
  | 'deadline_before_due'

export interface QuickAdded {
  boardId: string
  board: string
  key: string
}

export class QuickAddError extends Error {
  readonly code: QuickAddRefusal
  readonly typed: string | undefined
  /** The board searched for the section or person typed. */
  readonly board: string | undefined

  constructor(code: QuickAddRefusal, typed?: string, board?: string) {
    super(typed ? `${code}: ${typed}` : code)
    this.code = code
    this.typed = typed
    this.board = board
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

/**
 * The board a line names, else the default board if one can add to it, else
 * the inbox.
 */
export function findBoard(
  summaries: BoardSummary[],
  name: string | undefined,
  defaultBoardId?: string
): BoardSummary | undefined {
  if (name !== undefined) {
    return summaries.find(
      each =>
        !each.archived && (same(name, each.name) || same(name, each.keyPrefix))
    )
  }
  return (
    summaries.find(
      each =>
        each.id === defaultBoardId && each.role !== 'viewer' && !each.archived
    ) ?? summaries.find(each => each.inbox)
  )
}

/**
 * Everything the line names is found before the task is created, so a typo
 * creates nothing. Labels that do not exist yet are created.
 */
export async function quickAdd(
  api: BoardsApi,
  line: string,
  today: string,
  defaultBoardId?: string
): Promise<QuickAdded> {
  const parsed = parseQuickAdd(line, today)
  if (!parsed.title) throw new QuickAddError('no_title')
  if (deadlineBeforeDue(parsed.dueDate, parsed.deadline)) {
    throw new QuickAddError('deadline_before_due')
  }

  const summary = findBoard(
    await api.listBoards(),
    parsed.board,
    defaultBoardId
  )
  if (!summary) throw new QuickAddError('unknown_board', parsed.board)
  const board = await api.getBoard(summary.id)

  const { section: sectionName } = parsed
  const section =
    sectionName === undefined
      ? (board.sections.find(each => each.category === 'unstarted') ??
        board.sections[0] ??
        null)
      : board.sections.find(each => same(sectionName, each.name))
  if (section === undefined) {
    throw new QuickAddError('unknown_section', sectionName, board.name)
  }

  const assignees = parsed.people.map(typed => {
    const person = board.members.find(member => isPerson(typed, member.email))
    if (!person) throw new QuickAddError('unknown_person', typed, board.name)
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
            (await api.createLabel(board.id, { name: typed }))
          ).id
      )
    )
    await api.setLabels(board.id, task.id, labelIds)
  }

  if (assignees.length > 0) {
    await api.setAssignees(board.id, task.id, assignees)
  }

  return { boardId: board.id, board: board.name, key: task.key }
}
