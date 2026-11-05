import { shift, type Recurrence } from '../boards/index.ts'

export interface FeedTask {
  id: string
  key: string
  title: string
  boardId: string
  boardName: string
  priority: number | null
  dueDate: string
  dueTime: string | null
  dueZone: string | null
  duration: { amount: number; unit: 'minutes' | 'days' } | null
  recurrence: Recurrence | null
  labels: { name: string }[]
}

const DEFAULT_MINUTES = 30

const FREQUENCIES = {
  days: 'DAILY',
  weeks: 'WEEKLY',
  months: 'MONTHLY',
  years: 'YEARLY'
} as const

// RFC 5545 3.3.11: backslashes, semicolons, commas and line breaks are escaped.
const text = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')

// RFC 5545 3.1: lines fold at 75 octets, without splitting a character.
function fold(line: string): string {
  const parts: string[] = []
  let part = ''
  let octets = 0
  for (const character of line) {
    const size = Buffer.byteLength(character)
    if (octets + size > (parts.length === 0 ? 75 : 74)) {
      parts.push(part)
      part = ''
      octets = 0
    }
    part += character
    octets += size
  }
  parts.push(part)
  return parts.join('\r\n ')
}

const day = (date: string) => date.replaceAll('-', '')

// A task without a zone is due at the same wall clock time everywhere, which
// a floating time says.
function timing(task: FeedTask): string[] {
  if (task.dueTime === null) {
    const days = task.duration?.unit === 'days' ? task.duration.amount : 1
    return [
      `DTSTART;VALUE=DATE:${day(task.dueDate)}`,
      `DTEND;VALUE=DATE:${day(shift(task.dueDate, days, 'days'))}`
    ]
  }
  const zone = task.dueZone === null ? '' : `;TZID=${task.dueZone}`
  const duration =
    task.duration?.unit === 'days'
      ? `P${String(task.duration.amount)}D`
      : `PT${String(task.duration?.amount ?? DEFAULT_MINUTES)}M`
  return [
    `DTSTART${zone}:${day(task.dueDate)}T${task.dueTime.replace(':', '')}00`,
    `DURATION:${duration}`
  ]
}

// A task repeating from its completion date has no dates to come but the next.
const repeats = (rule: Recurrence | null): string[] =>
  rule && !rule.fromCompletion
    ? [`RRULE:FREQ=${FREQUENCIES[rule.unit]};INTERVAL=${String(rule.every)}`]
    : []

/** The person's tasks as an iCalendar (RFC 5545) of events on their due dates. */
export function calendarOf(
  tasks: FeedTask[],
  options: { appUrl: string; name: string; now: Date }
): string {
  const base = options.appUrl.replace(/\/$/, '')
  const stamp = `${options.now.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`
  const host = new URL(base).host
  const events = tasks.flatMap(task => {
    const link = `${base}/boards/${task.boardId}?task=${encodeURIComponent(task.key)}`
    const details = [
      task.priority === null ? null : `P${String(task.priority)}`,
      task.labels.length > 0
        ? task.labels.map(label => label.name).join(', ')
        : null
    ].filter(detail => detail !== null)
    const description = [
      task.boardName,
      ...(details.length > 0 ? [details.join(' · ')] : []),
      link
    ].join('\n')
    return [
      'BEGIN:VEVENT',
      `UID:${task.id}@${host}`,
      `DTSTAMP:${stamp}`,
      ...timing(task),
      ...repeats(task.recurrence),
      `SUMMARY:${text(`${task.key} ${task.title}`)}`,
      `DESCRIPTION:${text(description)}`,
      `URL:${link}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT'
    ]
  })
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Linagora//${text(options.name)}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${text(options.name)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...events,
    'END:VCALENDAR'
  ]
    .map(fold)
    .join('\r\n')
    .concat('\r\n')
}
