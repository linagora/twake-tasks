import type { BulkAction } from '@/application/boards'
import type { Task } from '@/domain/board'

/** The most tasks one change takes, as the server allows. */
export const BULK_LIMIT = 200

export interface BulkChange {
  taskIds: string[]
  action: BulkAction
}

// One change per distinct value the tasks had, in the order they come.
function grouped(
  tasks: Task[],
  keyOf: (task: Task) => string,
  actionOf: (task: Task) => BulkAction
): BulkChange[] {
  const groups = new Map<string, BulkChange>()
  for (const task of tasks) {
    const key = keyOf(task)
    const group = groups.get(key)
    if (group) group.taskIds.push(task.id)
    else groups.set(key, { taskIds: [task.id], action: actionOf(task) })
  }
  return [...groups.values()]
}

const dueOf = (task: Task) =>
  task.dueDate === null
    ? { dueDate: null }
    : {
        dueDate: task.dueDate,
        dueTime: task.dueTime,
        dueZone: task.dueZone,
        recurrence: task.recurrence
      }

/**
 * The changes that put `tasks`, as they were before `action`, back the way
 * they were; null when the action has no way back.
 */
export function undoOf(tasks: Task[], action: BulkAction): BulkChange[] | null {
  switch (action.kind) {
    case 'move':
      return grouped(
        tasks,
        task => String(task.sectionId),
        task => ({ kind: 'move', sectionId: task.sectionId })
      )
    case 'assign': {
      const changed = tasks.filter(
        task =>
          task.assignees.some(person => person.userId === action.userId) !==
          action.assigned
      )
      return changed.length === 0
        ? []
        : [
            {
              taskIds: changed.map(task => task.id),
              action: { ...action, assigned: !action.assigned }
            }
          ]
    }
    case 'label': {
      const changed = tasks.filter(
        task =>
          task.labels.some(label => label.id === action.labelId) !==
          action.labeled
      )
      return changed.length === 0
        ? []
        : [
            {
              taskIds: changed.map(task => task.id),
              action: { ...action, labeled: !action.labeled }
            }
          ]
    }
    case 'edit':
      return 'priority' in action.changes
        ? grouped(
            tasks,
            task => String(task.priority),
            task => ({ kind: 'edit', changes: { priority: task.priority } })
          )
        : grouped(
            tasks,
            task => JSON.stringify(dueOf(task)),
            task => ({ kind: 'edit', changes: dueOf(task) })
          )
    case 'archive':
    case 'trash':
      return [
        { taskIds: tasks.map(task => task.id), action: { kind: 'restore' } }
      ]
    case 'restore':
    case 'transfer':
      return null
  }
}
