import type { Task } from '@/domain/board'

export const localZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone

// en-CA formats a date as YYYY-MM-DD.
export const localToday = (): string =>
  new Intl.DateTimeFormat('en-CA').format(new Date())

export function formatDay(day: string, lang: string): string {
  return new Intl.DateTimeFormat(lang, {
    dateStyle: 'medium',
    timeZone: 'UTC'
  }).format(new Date(day))
}

// Late is red and today is amber, but only while the task is still open.
export function urgency(
  task: Pick<Task, 'dueDate' | 'completedAt' | 'canceledAt'>
): 'neutral' | 'warning' | 'error' {
  if (!task.dueDate || task.completedAt || task.canceledAt) return 'neutral'
  const today = localToday()
  if (task.dueDate < today) return 'error'
  return task.dueDate === today ? 'warning' : 'neutral'
}

export function shortDay(day: string, lang: string): string {
  const thisYear = day.slice(0, 4) === localToday().slice(0, 4)
  return new Intl.DateTimeFormat(lang, {
    month: 'short',
    day: 'numeric',
    ...(thisYear ? {} : { year: 'numeric' }),
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
