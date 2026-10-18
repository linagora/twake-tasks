import type { BoardsApi, FilterCriteria, TaskMove } from '@/application/boards'
import type { Board, BoardSummary, Priority, Section } from '@/domain/board'

/** A task made from a view, which the view's criteria fill in. */
export interface ViewTask {
  title: string
  boardId: string
  sectionId: string | null
  /** A status the view keeps to that the board lacks, made as its section. */
  newSection?: string | undefined
  /** Whether the signed-in person takes the task. */
  mine: boolean
  priority: Priority | null
  label: string | null
  dueDate: string | null
}

const yesterday = (today: string) => {
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

/**
 * What a new task takes so that the view keeps showing it: the first of its
 * boards, else the inbox; me if it keeps to me; its first priority, label and
 * due date range.
 */
export function viewTaskDefaults(
  criteria: FilterCriteria,
  boards: readonly BoardSummary[],
  today: string
): Omit<ViewTask, 'title' | 'sectionId'> {
  const writable = boards.filter(
    board => board.role !== 'viewer' && !board.archived
  )
  const board =
    writable.find(each => criteria.boards?.includes(each.id)) ??
    writable.find(each => each.inbox) ??
    writable[0]
  const due = criteria.dues?.[0]
  return {
    boardId: board?.id ?? '',
    mine: criteria.assignees?.includes('me') ?? false,
    priority: (criteria.priorities?.[0] as Priority | undefined) ?? null,
    label: criteria.labels?.[0] ?? null,
    dueDate:
      due === 'overdue'
        ? yesterday(today)
        : due === 'today' || due === 'week'
          ? today
          : null
  }
}

/** A view shows open tasks: the first section a task is open in. */
export function openSection(sections: readonly Section[]): Section | null {
  return (
    sections.find(each => each.category === 'unstarted') ??
    sections.find(
      each => each.category !== 'completed' && each.category !== 'canceled'
    ) ??
    null
  )
}

/**
 * The status a task moved to another board takes there: the one of the same
 * name, whatever its case, else the board's first open one, as for a task
 * with no status.
 */
export function keptSection(
  from: readonly Pick<Section, 'id' | 'name'>[],
  sectionId: string | null,
  to: readonly Section[]
): Section | null {
  const name = from.find(each => each.id === sectionId)?.name
  const same =
    name === undefined
      ? undefined
      : to.find(
          each =>
            each.name.trim().toLocaleLowerCase() ===
            name.trim().toLocaleLowerCase()
        )
  return same ?? openSection(to)
}

/** What a task made from a view may be left without, once it is created. */
export const VIEW_TASK_FACTS = ['priority', 'dueDate', 'label', 'me'] as const

export type ViewTaskFact = (typeof VIEW_TASK_FACTS)[number]

/**
 * Creates the task, then gives it what the view asks; a missing section or
 * label is made. Once the task is created, what it could not be given is
 * said rather than thrown, so that it is not made twice: me too when I am
 * not a member of its board.
 */
export async function createViewTask(
  api: BoardsApi,
  task: ViewTask,
  board: Board,
  myEmail: string | null
): Promise<{ key: string; unset: ViewTaskFact[] }> {
  const sectionId =
    task.newSection === undefined
      ? task.sectionId
      : (
          await api.createSection(board.id, {
            name: task.newSection,
            category: 'started'
          })
        ).id
  const created = await api.createTask(board.id, {
    title: task.title,
    sectionId
  })
  const unset: ViewTaskFact[] = []
  const given = async (facts: ViewTaskFact[], give: () => Promise<unknown>) => {
    try {
      await give()
    } catch {
      unset.push(...facts)
    }
  }
  if (task.priority !== null || task.dueDate !== null) {
    await given(
      [
        ...(task.priority !== null ? (['priority'] as const) : []),
        ...(task.dueDate !== null ? (['dueDate'] as const) : [])
      ],
      () =>
        api.editTask(board.id, created.id, {
          ...(task.priority !== null && { priority: task.priority }),
          ...(task.dueDate !== null && { dueDate: task.dueDate })
        })
    )
  }
  const { label } = task
  if (label !== null) {
    await given(['label'], async () => {
      const found =
        board.labels.find(
          each => each.name.toLocaleLowerCase() === label.toLocaleLowerCase()
        ) ?? (await api.createLabel(board.id, { name: label }))
      await api.setLabels(board.id, created.id, [found.id])
    })
  }
  if (task.mine) {
    const me =
      myEmail === null
        ? undefined
        : board.members.find(
            member => member.email.toLowerCase() === myEmail.toLowerCase()
          )
    if (me) {
      await given(['me'], () =>
        api.setAssignees(board.id, created.id, [me.userId])
      )
    } else {
      unset.push('me')
    }
  }
  return { key: created.key, unset }
}

/**
 * Where a task made in a column of a view goes: the column's section in the
 * view's board, else in the first other board having it; the view's board
 * with no section for the column of no section, or one no board has.
 */
export function placeInColumn(
  defaultBoardId: string,
  boards: readonly Pick<Board, 'id' | 'sections'>[],
  sectionName: string | null
): { boardId: string; sectionId: string | null } {
  if (sectionName === null) return { boardId: defaultBoardId, sectionId: null }
  const named = (board: Pick<Board, 'sections'>) =>
    board.sections.find(
      each =>
        each.name.trim().toLocaleLowerCase() ===
        sectionName.trim().toLocaleLowerCase()
    )
  const ordered = [
    ...boards.filter(board => board.id === defaultBoardId),
    ...boards.filter(board => board.id !== defaultBoardId)
  ]
  for (const board of ordered) {
    const section = named(board)
    if (section) return { boardId: board.id, sectionId: section.id }
  }
  return { boardId: defaultBoardId, sectionId: null }
}

/**
 * A task dropped in a column of a view moves to the section of that name in
 * its own board, next to the neighbours of its board only; null when its
 * board has no such section.
 */
export function viewMove(
  board: Pick<Board, 'sections'>,
  sectionName: string | null,
  move: TaskMove,
  sameBoard: (taskId: string) => boolean
): TaskMove | null {
  const section =
    sectionName === null
      ? null
      : board.sections.find(
          each =>
            each.name.trim().toLocaleLowerCase() ===
            sectionName.trim().toLocaleLowerCase()
        )
  if (section === undefined) return null
  const { afterId, beforeId } = move
  return {
    sectionId: section?.id ?? null,
    ...(afterId !== undefined && sameBoard(afterId) && { afterId }),
    ...(beforeId !== undefined && sameBoard(beforeId) && { beforeId })
  }
}
