import type { Task } from '@/domain/board'

export const localZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone

export function formatDay(day: string, lang: string): string {
  return new Intl.DateTimeFormat(lang, {
    dateStyle: 'medium',
    timeZone: 'UTC'
  }).format(new Date(day))
}

// A pinned time shows its zone when the reader is elsewhere.
export function dueLabel(
  task: Pick<Task, 'dueDate' | 'dueTime' | 'dueZone'>,
  lang: string
): string | null {
  if (!task.dueDate) return null
  const day = formatDay(task.dueDate, lang)
  if (!task.dueTime) return day
  const zone =
    task.dueZone && task.dueZone !== localZone() ? ` ${task.dueZone}` : ''
  return `${day}, ${task.dueTime}${zone}`
}
