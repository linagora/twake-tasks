import type { Board, SectionCategory, Task } from '@/domain/board'

type Source = Pick<Board, 'id' | 'sections'>
type Placed = Pick<Task, 'sectionId'> & { boardId: string }

const CATEGORY_ORDER: readonly SectionCategory[] = [
  'backlog',
  'unstarted',
  'started',
  'completed',
  'canceled'
]

export interface ViewColumn<T> {
  key: string
  /** The section's name; null for the tasks in no section. */
  name: string | null
  tasks: T[]
}

const keyOf = (name: string) => name.trim().toLocaleLowerCase()

/**
 * The columns of a view of tasks from many boards: the sections of those
 * boards, one per name whatever its case, by category then as the boards
 * order them. A task in no section, or whose board is not known, is in the
 * column of no section, first. Unless `all`, the columns with no task are left out.
 */
export function viewColumns<T extends Placed>(
  tasks: readonly T[],
  boards: readonly Source[],
  all: boolean
): ViewColumn<T>[] {
  const byId = new Map(boards.map(board => [board.id, board]))
  const shown = boards.filter(board =>
    tasks.some(task => task.boardId === board.id)
  )
  const sections = shown
    .flatMap((board, boardIndex) =>
      board.sections.map((section, index) => ({ section, boardIndex, index }))
    )
    .sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.section.category) -
          CATEGORY_ORDER.indexOf(b.section.category) ||
        a.index - b.index ||
        a.boardIndex - b.boardIndex
    )
  const columns = new Map<string, ViewColumn<T>>([
    ['none', { key: 'none', name: null, tasks: [] }]
  ])
  for (const { section } of sections) {
    const key = `section:${keyOf(section.name)}`
    if (!columns.has(key)) {
      columns.set(key, { key, name: section.name, tasks: [] })
    }
  }
  for (const task of tasks) {
    const section = byId
      .get(task.boardId)
      ?.sections.find(each => each.id === task.sectionId)
    const key = section ? `section:${keyOf(section.name)}` : 'none'
    columns.get(key)?.tasks.push(task)
  }
  return [...columns.values()].filter(
    column => column.tasks.length > 0 || (all && column.key !== 'none')
  )
}
