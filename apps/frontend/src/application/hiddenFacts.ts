import type { Grouping } from '@/domain/board'

/**
 * What a list of tasks leaves off each task because the list keeps to it: a
 * board's tasks need not name the board, nor a label's tasks the label.
 */
export interface HiddenFacts {
  board: boolean
  /** The label the list keeps to, in any case. */
  label: string | null
  priority: boolean
  assignees: boolean
  /** Only when every task has the same due date, or none. */
  due: boolean
}

export const NO_HIDDEN_FACTS: HiddenFacts = {
  board: false,
  label: null,
  priority: false,
  assignees: false,
  due: false
}

/**
 * What the tasks of a view leave off: what they are grouped by, which their
 * column says, and nothing else. A task in the column of a label leaves off
 * that label only.
 */
export function hiddenFactsOf(
  groupBy: Grouping,
  label: string | null = null
): HiddenFacts {
  return {
    board: groupBy === 'board',
    label: groupBy === 'label' ? label : null,
    priority: groupBy === 'priority',
    assignees: groupBy === 'assignee',
    due: groupBy === 'due'
  }
}

export const shownLabels = <T extends { name: string }>(
  labels: readonly T[],
  hidden: HiddenFacts
): T[] =>
  labels.filter(
    label =>
      label.name.toLocaleLowerCase() !== hidden.label?.toLocaleLowerCase()
  )
