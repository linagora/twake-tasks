import type { TaskChanges } from '@/application/boards'
import type { Task } from '@/domain/board'

export const addDays = (day: string, amount: number): string => {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

const daysBetween = (from: string, to: string): number =>
  (Date.parse(to) - Date.parse(from)) / 86_400_000

/**
 * Moving the due date to `day` keeps its time, and moves the deadline along
 * so the gap between them stays. No day removes the due date and its time.
 */
export function reschedule(
  task: Pick<Task, 'dueDate' | 'deadline'>,
  day: string | null
): TaskChanges {
  if (day === null) return { dueDate: null, dueTime: null }
  if (task.dueDate === null || task.deadline === null) return { dueDate: day }
  return {
    dueDate: day,
    deadline: addDays(task.deadline, daysBetween(task.dueDate, day))
  }
}
