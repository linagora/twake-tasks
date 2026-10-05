import type { tasks } from './schema.ts'

type Unit = NonNullable<(typeof tasks.$inferSelect)['recurUnit']>

export interface Recurrence {
  every: number
  unit: Unit
  fromCompletion: boolean
}

// Months keep the day when they can, and fall back to their last day.
export function shift(day: string, amount: number, unit: Unit): string {
  const date = new Date(`${day}T00:00:00Z`)
  if (unit === 'days' || unit === 'weeks') {
    date.setUTCDate(date.getUTCDate() + amount * (unit === 'weeks' ? 7 : 1))
    return date.toISOString().slice(0, 10)
  }
  const month = date.getUTCMonth() + amount * (unit === 'years' ? 12 : 1)
  const last = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0))
  last.setUTCDate(Math.min(date.getUTCDate(), last.getUTCDate()))
  return last.toISOString().slice(0, 10)
}

export function todayIn(zone: string | null): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone ?? 'UTC' }).format(
    new Date()
  )
}

// An overdue task skips to its first occurrence after today.
export function nextOccurrence(
  dueDate: string,
  rule: Recurrence,
  today: string
): string {
  if (rule.fromCompletion) return shift(today, rule.every, rule.unit)
  let times = 1
  while (shift(dueDate, rule.every * times, rule.unit) <= today) times++
  return shift(dueDate, rule.every * times, rule.unit)
}

export function recurrenceOf(
  task: typeof tasks.$inferSelect
): Recurrence | null {
  return task.recurEvery && task.recurUnit
    ? {
        every: task.recurEvery,
        unit: task.recurUnit,
        fromCompletion: task.recurFromCompletion
      }
    : null
}
