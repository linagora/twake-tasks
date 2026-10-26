import type { Task } from '@/domain/board'
import { displayName } from '@/domain/person'

export const TASK_SORT_KEYS = [
  'title',
  'assignees',
  'due',
  'priority',
  'labels'
] as const

export type TaskSortKey = (typeof TASK_SORT_KEYS)[number]

export interface TaskSort {
  key: TaskSortKey
  order: 'asc' | 'desc'
}

/** The next sort on a click of a column's header: up, down, then none. */
export function nextSort(
  sort: TaskSort | null,
  key: TaskSortKey
): TaskSort | null {
  if (sort?.key !== key) return { key, order: 'asc' }
  return sort.order === 'asc' ? { key, order: 'desc' } : null
}

type Value = string | number | null

function valueOf(task: Task, key: TaskSortKey): Value {
  switch (key) {
    case 'title':
      return task.title
    case 'assignees': {
      const [first] = task.assignees.map(displayName).sort()
      return first ?? null
    }
    case 'due':
      return task.dueDate && `${task.dueDate}T${task.dueTime ?? ''}`
    case 'priority':
      return task.priority
    case 'labels': {
      const [first] = task.labels.map(label => label.name).sort()
      return first ?? null
    }
  }
}

/**
 * The tasks in the order of the sort, those without a value last either way,
 * as a spreadsheet keeps its empty cells at the bottom; ties keep their order.
 */
export function sortTasks(
  tasks: readonly Task[],
  sort: TaskSort,
  collator: Intl.Collator
): Task[] {
  const direction = sort.order === 'asc' ? 1 : -1
  return tasks
    .map(task => ({ task, value: valueOf(task, sort.key) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        return Number(a.value === null) - Number(b.value === null)
      }
      const order =
        typeof a.value === 'number' && typeof b.value === 'number'
          ? a.value - b.value
          : collator.compare(String(a.value), String(b.value))
      return order * direction
    })
    .map(({ task }) => task)
}
