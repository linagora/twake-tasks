import type { ScheduleRule } from '@twake-tasks/api-contract'

export interface Cadence {
  rule: ScheduleRule
  /** HH:mm, on the wall clock of `zone`. */
  time: string
  zone: string
  workingDays: boolean
  /** The day "every N" periods count from. */
  startsOn: string
  /** The last day a run may fall on. */
  endsOn: string | null
}

const DAY = 864e5

// Days are counted from 1970-01-01, which makes them plain integers.
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY

const dayOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10)

/** 1 is Monday, 7 Sunday. */
const weekdayOf = (n: number) => ((new Date(n * DAY).getUTCDay() + 6) % 7) + 1

const isWorking = (n: number) => weekdayOf(n) <= 5

function workingDaysBetween(from: number, to: number): number {
  const weeks = Math.floor((to - from) / 7)
  let count = weeks * 5
  for (let n = from + weeks * 7; n < to; n++) if (isWorking(n)) count++
  return count
}

const monthIndex = (n: number) => {
  const date = new Date(n * DAY)
  return date.getUTCFullYear() * 12 + date.getUTCMonth()
}

function dayInMonth(index: number, day: number | 'last'): number {
  const year = Math.floor(index / 12)
  const month = index % 12
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return (
    Date.UTC(year, month, day === 'last' ? last : Math.min(day, last)) / DAY
  )
}

function workingOnOrBefore(n: number): number {
  let day = n
  while (!isWorking(day)) day--
  return day
}

function runsOn(cadence: Cadence, n: number): boolean {
  const { rule, workingDays } = cadence
  const start = dayNumber(cadence.startsOn)
  if (n < start) return false
  switch (rule.kind) {
    case 'daily':
      return workingDays
        ? isWorking(n) && workingDaysBetween(start, n) % rule.every === 0
        : (n - start) % rule.every === 0
    case 'weekly': {
      const monday = (day: number) => day - weekdayOf(day) + 1
      return (
        rule.weekdays.includes(weekdayOf(n)) &&
        (!workingDays || isWorking(n)) &&
        ((monday(n) - monday(start)) / 7) % rule.every === 0
      )
    }
    case 'monthly':
    case 'yearly': {
      const every = rule.kind === 'monthly' ? rule.every : 1
      const first = monthIndex(start)
      // Moved to the working day before, a run can fall in the month before.
      return [monthIndex(n), monthIndex(n) + 1].some(index => {
        if (index < first || (index - first) % every !== 0) return false
        if (rule.kind === 'yearly' && index % 12 !== rule.month - 1) {
          return false
        }
        const day = dayInMonth(index, rule.day)
        return (workingDays ? workingOnOrBefore(day) : day) === n
      })
    }
  }
}

const clocks = new Map<string, Intl.DateTimeFormat>()

function clockOf(zone: string): Intl.DateTimeFormat {
  let clock = clocks.get(zone)
  if (!clock) {
    clock = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    clocks.set(zone, clock)
  }
  return clock
}

function offsetAt(at: number, zone: string): number {
  const parts = Object.fromEntries(
    clockOf(zone)
      .formatToParts(new Date(at))
      .map(part => [part.type, Number(part.value)])
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>
  const wall = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
  return wall - Math.floor(at / 1000) * 1000
}

/**
 * The instant the wall clock of `zone` shows `time` on `day`. A time the
 * clocks skip comes an hour later, and a time they show twice is the first.
 */
export function instantIn(day: string, time: string, zone: string): Date {
  const wall = Date.parse(`${day}T${time}:00Z`)
  const before = wall - offsetAt(wall - DAY, zone)
  const after = wall - offsetAt(wall + DAY, zone)
  const shows = (at: number) => at + offsetAt(at, zone) === wall
  return new Date(shows(before) || !shows(after) ? before : after)
}

export function dayIn(zone: string, at: Date): string {
  const parts = Object.fromEntries(
    clockOf(zone)
      .formatToParts(at)
      .map(part => [part.type, part.value])
  ) as Record<'year' | 'month' | 'day', string>
  return `${parts.year}-${parts.month}-${parts.day}`
}

// The longest gap between two runs: a yearly run, or every 365 working days.
const HORIZON = 800

/** The first run after `after`, or null once the schedule has ended. */
export function nextRun(cadence: Cadence, after: Date): Date | null {
  const from = Math.max(
    dayNumber(dayIn(cadence.zone, after)),
    dayNumber(cadence.startsOn)
  )
  const last = Math.min(
    cadence.endsOn === null ? Infinity : dayNumber(cadence.endsOn),
    from + HORIZON
  )
  for (let n = from; n <= last; n++) {
    if (!runsOn(cadence, n)) continue
    const at = instantIn(dayOf(n), cadence.time, cadence.zone)
    if (at > after) return at
  }
  return null
}
