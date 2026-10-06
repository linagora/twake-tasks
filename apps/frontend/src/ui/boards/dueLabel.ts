import type { Task } from '@/domain/board'

let followedZone: string | null = null

function isZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** Counts days in this zone rather than the browser's, unless it is null or unknown. */
export function followZone(zone: string | null): void {
  followedZone = zone && isZone(zone) ? zone : null
}

export const localZone = (): string =>
  followedZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

// en-CA formats a date as YYYY-MM-DD.
export const localToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: localZone() }).format(new Date())

/** The instant a YYYY-MM-DDTHH:mm wall clock time shows in the local zone. */
export function zonedInstant(wallClock: string): Date {
  const asUtc = Date.parse(`${wallClock}Z`)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: localZone(),
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    })
      .formatToParts(asUtc)
      .map(part => [part.type, Number(part.value)])
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', number>
  const shown = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute
  )
  return new Date(2 * asUtc - shown)
}

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
