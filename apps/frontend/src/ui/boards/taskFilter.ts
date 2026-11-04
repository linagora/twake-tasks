import type { FilterCriteria } from '@/application/boards'
import { addDays } from '@/application/reschedule'
import { fold } from '@/ds/Highlight'
import { isDone, type Section, type Task } from '@/domain/board'

export const PRIORITIES = [1, 2, 3, 4] as const
export const DUES = ['overdue', 'today', 'week', 'none'] as const
export type Due = (typeof DUES)[number]

/**
 * What narrows the board on screen, with the meaning of a saved filter: each
 * criterion matches any of its values, a task must match every criterion.
 */
export interface BoardFilter {
  text: string
  /** `me`, `nobody`, or a user id. */
  assignee: string[]
  /** Label names, matched in any case. */
  label: string[]
  priority: number[]
  due: Due[]
}

// `due` and `assign` already preset the new task dialog, and the header's
// search field shows `q`.
const PARAMS = {
  text: 'text',
  assignee: 'assignee',
  label: 'label',
  priority: 'priority',
  due: 'when'
} as const

const isDue = (value: string): value is Due =>
  (DUES as readonly string[]).includes(value)

export function readFilter(params: URLSearchParams): BoardFilter {
  return {
    text: params.get(PARAMS.text) ?? '',
    assignee: params.getAll(PARAMS.assignee),
    label: params.getAll(PARAMS.label),
    priority: params
      .getAll(PARAMS.priority)
      .map(Number)
      .filter(level => (PRIORITIES as readonly number[]).includes(level)),
    due: params.getAll(PARAMS.due).filter(isDue)
  }
}

export function writeFilter(
  params: URLSearchParams,
  filter: BoardFilter
): URLSearchParams {
  const next = new URLSearchParams(params)
  for (const name of Object.values(PARAMS)) next.delete(name)
  if (filter.text) next.set(PARAMS.text, filter.text)
  for (const key of ['assignee', 'label', 'priority', 'due'] as const)
    for (const value of filter[key]) next.append(PARAMS[key], String(value))
  return next
}

export const NO_FILTER: BoardFilter = {
  text: '',
  assignee: [],
  label: [],
  priority: [],
  due: []
}

export const criteriaCount = (filter: BoardFilter): number =>
  [
    filter.text.trim(),
    filter.assignee.length,
    filter.label.length,
    filter.priority.length,
    filter.due.length
  ].filter(Boolean).length

/** The filter a saved one can hold: saved filters have no text criterion. */
export const savedCriteria = (
  filter: BoardFilter,
  boardId: string
): FilterCriteria => ({
  board: [boardId],
  ...(filter.assignee.length > 0 && { assignee: filter.assignee }),
  ...(filter.priority.length > 0 && { priority: filter.priority }),
  ...(filter.label.length > 0 && { label: filter.label }),
  ...(filter.due.length > 0 && { due: filter.due })
})

function dueMatches(
  due: Due,
  task: Task,
  today: string,
  sections: readonly Section[]
): boolean {
  const day = task.dueDate
  switch (due) {
    case 'overdue':
      return day !== null && day < today && !isDone(task, sections)
    case 'today':
      return day === today
    case 'week':
      return day !== null && day >= today && day < addDays(today, 7)
    case 'none':
      return day === null
  }
}

export function taskMatches(
  task: Task,
  filter: BoardFilter,
  context: {
    myEmail: string | null
    today: string
    sections: readonly Section[]
  }
): boolean {
  const { assignee, label, priority, due } = filter
  const words = fold(filter.text).split(/\s+/).filter(Boolean)
  const text = fold(`${task.key} ${task.title}`)
  const me = context.myEmail?.toLowerCase()
  const labels = new Set(label.map(name => name.toLowerCase()))
  return (
    words.every(word => text.includes(word)) &&
    (assignee.length === 0 ||
      assignee.some(each =>
        each === 'nobody'
          ? task.assignees.length === 0
          : task.assignees.some(person =>
              each === 'me'
                ? person.email.toLowerCase() === me
                : person.userId === each
            )
      )) &&
    (labels.size === 0 ||
      task.labels.some(each => labels.has(each.name.toLowerCase()))) &&
    (priority.length === 0 ||
      (task.priority !== null && priority.includes(task.priority))) &&
    (due.length === 0 ||
      due.some(each => dueMatches(each, task, context.today, context.sections)))
  )
}
