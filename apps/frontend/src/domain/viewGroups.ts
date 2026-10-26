import type { Grouping, Person, Priority, Task } from '@/domain/board'

type Grouped = Pick<Task, 'priority' | 'dueDate' | 'assignees' | 'labels'> & {
  boardId: string
  boardName: string
}

/** What tasks of a group share, which the screen names. */
export type Group =
  | { by: 'board'; name: string }
  | { by: 'assignee'; person: Person | null }
  | { by: 'priority'; level: Priority | null }
  | { by: 'label'; name: string | null }
  | { by: 'due'; when: 'overdue' | 'today' | 'week' | 'later' | 'none' }

export interface ViewGroup<T> {
  key: string
  group: Group
  tasks: T[]
}

const DUES = ['overdue', 'today', 'week', 'later', 'none'] as const

const inDays = (today: string, days: number) => {
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const whenDue = (dueDate: string | null, today: string) =>
  dueDate === null
    ? 'none'
    : dueDate < today
      ? 'overdue'
      : dueDate === today
        ? 'today'
        : dueDate < inDays(today, 7)
          ? 'week'
          : 'later'

// The groups a task is in: one, except a task of many people or labels,
// which is in the group of each.
function groupsOf(
  task: Grouped,
  by: Exclude<Grouping, 'status'>,
  today: string
): { key: string; group: Group }[] {
  switch (by) {
    case 'board':
      return [
        {
          key: `board:${task.boardId}`,
          group: { by, name: task.boardName }
        }
      ]
    case 'assignee':
      return task.assignees.length === 0
        ? [{ key: 'assignee:none', group: { by, person: null } }]
        : task.assignees.map(person => ({
            key: `assignee:${person.userId}`,
            group: { by, person }
          }))
    case 'priority':
      return [
        {
          key: `priority:${String(task.priority ?? 'none')}`,
          group: { by, level: task.priority }
        }
      ]
    case 'label':
      return task.labels.length === 0
        ? [{ key: 'label:none', group: { by, name: null } }]
        : [
            ...new Map(
              task.labels.map(label => [
                label.name.trim().toLocaleLowerCase(),
                label.name
              ])
            )
          ].map(([key, name]) => ({
            key: `label:${key}`,
            group: { by, name }
          }))
    case 'due': {
      const when = whenDue(task.dueDate, today)
      return [{ key: `due:${when}`, group: { by, when } }]
    }
  }
}

// The groups in their order: by name for boards, people and labels, the
// highest priority and the soonest date first, and the tasks with none last.
function rank(group: Group): [number, string] {
  switch (group.by) {
    case 'board':
      return [0, group.name.toLocaleLowerCase()]
    case 'assignee':
      return group.person === null
        ? [1, '']
        : [0, (group.person.name ?? group.person.email).toLocaleLowerCase()]
    case 'priority':
      return [group.level ?? 5, '']
    case 'label':
      return group.name === null ? [1, ''] : [0, group.name.toLocaleLowerCase()]
    case 'due':
      return [DUES.indexOf(group.when), '']
  }
}

/**
 * The columns of a view grouped by something else than the tasks' statuses:
 * one per board, person, priority, label or due date range its tasks have.
 */
export function viewGroups<T extends Grouped>(
  tasks: readonly T[],
  by: Exclude<Grouping, 'status'>,
  today: string
): ViewGroup<T>[] {
  const groups = new Map<string, ViewGroup<T>>()
  for (const task of tasks) {
    for (const { key, group } of groupsOf(task, by, today)) {
      const found = groups.get(key) ?? { key, group, tasks: [] }
      found.tasks.push(task)
      groups.set(key, found)
    }
  }
  return [...groups.values()].sort((a, b) => {
    const [aRank, aName] = rank(a.group)
    const [bRank, bName] = rank(b.group)
    return aRank - bRank || aName.localeCompare(bName)
  })
}
