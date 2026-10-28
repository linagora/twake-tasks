import type { tasks } from './schema.ts'

type Unit = NonNullable<(typeof tasks.$inferSelect)['recurUnit']>

export interface Recurrence {
  every: number
  unit: Unit
  fromCompletion: boolean
}

// A day is stored with a four-digit year, and only then does it compare as a
// string in calendar order.
function dayOf(date: Date): string {
  if (date.getUTCFullYear() > 9999) throw new RangeError('after year 9999')
  return date.toISOString().slice(0, 10)
}

// Months keep the day when they can, and fall back to their last day.
export function shift(day: string, amount: number, unit: Unit): string {
  const date = new Date(`${day}T00:00:00Z`)
  if (unit === 'days' || unit === 'weeks') {
    date.setUTCDate(date.getUTCDate() + amount * (unit === 'weeks' ? 7 : 1))
    return dayOf(date)
  }
  const month = date.getUTCMonth() + amount * (unit === 'years' ? 12 : 1)
  const last = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0))
  last.setUTCDate(Math.min(date.getUTCDate(), last.getUTCDate()))
  return dayOf(last)
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5
  )
}

export function todayIn(zone: string | null): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone ?? 'UTC' }).format(
    new Date()
  )
}

function monthsBetween(from: string, to: string): number {
  const months = (day: string) =>
    Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7))
  return months(to) - months(from)
}

// An overdue task skips to its first occurrence after today. The periods are
// counted, not walked, since the due date can be centuries back.
export function nextOccurrence(
  dueDate: string,
  rule: Recurrence,
  today: string
): string {
  if (rule.fromCompletion) return shift(today, rule.every, rule.unit)
  const elapsed =
    rule.unit === 'days' || rule.unit === 'weeks'
      ? daysBetween(dueDate, today) / (rule.unit === 'weeks' ? 7 : 1)
      : monthsBetween(dueDate, today) / (rule.unit === 'years' ? 12 : 1)
  let times = Math.max(1, Math.floor(elapsed / rule.every))
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
