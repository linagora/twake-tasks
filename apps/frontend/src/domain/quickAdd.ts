import type { Duration, Priority, Recurrence } from '@/domain/board'

/** Names as typed: the board, section, labels and people are matched later. */
export interface QuickTask {
  title: string
  board?: string
  section?: string
  labels: string[]
  people: string[]
  priority?: Priority
  dueDate?: string
  dueTime?: string
  deadline?: string
  duration?: Duration
  recurrence?: Recurrence
}

type Unit = Recurrence['unit']

const START = '(?<=^|\\s)'
// A date word followed by ".com" is not a date.
const END = '(?=$|\\s|[,.;:!?](?:\\s|$))'

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6
}

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
  janvier: 1,
  janv: 1,
  février: 2,
  fevrier: 2,
  févr: 2,
  mars: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  juil: 7,
  août: 8,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
  decembre: 12,
  déc: 12
}

const UNITS: Record<string, Unit> = {
  day: 'days',
  days: 'days',
  week: 'weeks',
  weeks: 'weeks',
  month: 'months',
  months: 'months',
  year: 'years',
  years: 'years',
  jour: 'days',
  jours: 'days',
  semaine: 'weeks',
  semaines: 'weeks',
  mois: 'months',
  an: 'years',
  ans: 'years',
  année: 'years',
  années: 'years'
}

const ADVERBS: Record<string, Unit> = {
  daily: 'days',
  weekly: 'weeks',
  monthly: 'months',
  yearly: 'years'
}

const alternatives = (words: Record<string, unknown>) =>
  Object.keys(words)
    .sort((a, b) => b.length - a.length)
    .join('|')

const WEEKDAY = alternatives(WEEKDAYS)
const MONTH = alternatives(MONTHS)
const UNIT = alternatives(UNITS)

const word = (pattern: string) => new RegExp(`${START}${pattern}${END}`, 'iu')

const dayOf = (date: Date) => date.toISOString().slice(0, 10)
const dateOf = (day: string) => new Date(`${day}T00:00:00Z`)

function shift(day: string, amount: number, unit: Unit): string {
  const date = dateOf(day)
  if (unit === 'days' || unit === 'weeks') {
    date.setUTCDate(date.getUTCDate() + amount * (unit === 'weeks' ? 7 : 1))
    return dayOf(date)
  }
  const months = amount * (unit === 'years' ? 12 : 1)
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)
  )
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate()
  target.setUTCDate(Math.min(date.getUTCDate(), last))
  return dayOf(target)
}

function weekdayFrom(today: string, weekday: string, includeToday: boolean) {
  const target = WEEKDAYS[weekday.toLowerCase()] ?? 0
  const gap = (target - dateOf(today).getUTCDay() + 7) % 7
  return shift(today, gap === 0 && !includeToday ? 7 : gap, 'days')
}

function calendarDay(today: string, day: string, month: string, year?: string) {
  const monthNumber = MONTHS[month.toLowerCase()] ?? 1
  const at = (y: number) => {
    const date = new Date(Date.UTC(y, monthNumber - 1, Number(day)))
    return date.getUTCMonth() === monthNumber - 1 ? dayOf(date) : null
  }
  if (year) return at(Number(year))
  const thisYear = dateOf(today).getUTCFullYear()
  const candidate = at(thisYear)
  return candidate && candidate >= today ? candidate : at(thisYear + 1)
}

type Rule<T> = [RegExp, (match: RegExpExecArray) => T | null]

const dateRules = (today: string): Rule<string>[] => [
  [word('(\\d{4}-\\d{2}-\\d{2})'), m => m[1] ?? null],
  [word("(?:today|aujourd'hui|aujourd’hui)"), () => today],
  [
    word('(?:after tomorrow|après-demain|apres-demain)'),
    () => shift(today, 2, 'days')
  ],
  [word('(?:tomorrow|demain)'), () => shift(today, 1, 'days')],
  [
    word(`(?:in|dans)\\s+(\\d{1,3})\\s+(${UNIT})`),
    m => shift(today, Number(m[1]), UNITS[(m[2] ?? '').toLowerCase()] ?? 'days')
  ],
  [
    word(
      `(?:on\\s+|le\\s+)?(\\d{1,2})(?:er|st|nd|rd|th)?\\s+(${MONTH})(?:\\s+(\\d{4}))?`
    ),
    m => calendarDay(today, m[1] ?? '', m[2] ?? '', m[3])
  ],
  [
    word(
      `(?:on\\s+)?(${MONTH})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`
    ),
    m => calendarDay(today, m[2] ?? '', m[1] ?? '', m[3])
  ],
  [
    word(`(?:on\\s+|next\\s+)?(${WEEKDAY})(?:\\s+prochain)?`),
    m => weekdayFrom(today, m[1] ?? '', false)
  ]
]

const hhmm = (hours: number, minutes: number) =>
  hours > 23 || minutes > 59
    ? null
    : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

const timeRules: Rule<string>[] = [
  [
    word('(?:at\\s+|à\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)'),
    m => {
      const hours = Number(m[1])
      if (hours < 1 || hours > 12) return null
      const pm = m[3]?.toLowerCase() === 'pm'
      return hhmm((hours % 12) + (pm ? 12 : 0), Number(m[2] ?? 0))
    }
  ],
  [
    word('(?:at\\s+|à\\s+)?(\\d{1,2})h(\\d{2})?'),
    m => hhmm(Number(m[1]), Number(m[2] ?? 0))
  ],
  [
    word('(?:at\\s+|à\\s+)?(\\d{1,2}):(\\d{2})'),
    m => hhmm(Number(m[1]), Number(m[2]))
  ]
]

const recurrenceRules = (
  today: string
): Rule<{ recurrence: Recurrence; from?: string }>[] => [
  [
    word(`(?:every|chaque|tous les|toutes les)(!?)\\s+(${WEEKDAY})s?`),
    m => ({
      recurrence: { every: 1, unit: 'weeks', fromCompletion: m[1] === '!' },
      from: weekdayFrom(today, m[2] ?? '', true)
    })
  ],
  [
    word(
      `(?:every|chaque|tous les|toutes les)(!?)\\s+(?:(\\d{1,3})\\s+)?(${UNIT})`
    ),
    m => ({
      recurrence: {
        every: Number(m[2] ?? 1),
        unit: UNITS[(m[3] ?? '').toLowerCase()] ?? 'days',
        fromCompletion: m[1] === '!'
      }
    })
  ],
  [
    word(`(${alternatives(ADVERBS)})`),
    m => ({
      recurrence: {
        every: 1,
        unit: ADVERBS[(m[1] ?? '').toLowerCase()] ?? 'days',
        fromCompletion: false
      }
    })
  ]
]

function take<T>(
  text: string,
  rules: Rule<T>[]
): { value: T; rest: string } | null {
  for (const [pattern, read] of rules) {
    const match = pattern.exec(text)
    if (!match) continue
    const value = read(match)
    if (value === null) continue
    return {
      value,
      rest:
        text.slice(0, match.index) + text.slice(match.index + match[0].length)
    }
  }
  return null
}

function takeAll(
  text: string,
  sigil: string
): { names: string[]; rest: string } {
  const names: string[] = []
  const rest = text.replace(
    new RegExp(`${START}[${sigil}](\\S+)`, 'gu'),
    (_, name: string) => {
      names.push(name)
      return ''
    }
  )
  return { names, rest }
}

/** `today` is the person's own calendar day, `YYYY-MM-DD`. */
export function parseQuickAdd(line: string, today: string): QuickTask {
  const task: QuickTask = { title: '', labels: [], people: [] }
  let text = ` ${line} `

  const board = takeAll(text, '#')
  text = board.rest
  if (board.names[0]) task.board = board.names[0]
  const section = takeAll(text, '/')
  text = section.rest
  if (section.names[0]) task.section = section.names[0]
  const labels = takeAll(text, '%')
  text = labels.rest
  task.labels = labels.names
  const people = takeAll(text, '+')
  text = people.rest
  task.people = people.names

  const priority = take(text, [
    [word('p([1-4])'), m => Number(m[1]) as Priority]
  ])
  if (priority) {
    task.priority = priority.value
    text = priority.rest
  }

  const duration = take<Duration>(text, [
    [
      word('!(\\d{1,5})(min|m|h|d|j)'),
      m => {
        const amount = Number(m[1])
        if (amount < 1) return null
        const unit = m[2]?.toLowerCase()
        if (unit === 'h') return { amount: amount * 60, unit: 'minutes' }
        if (unit === 'd' || unit === 'j') return { amount, unit: 'days' }
        return { amount, unit: 'minutes' }
      }
    ]
  ])
  if (duration) {
    task.duration = duration.value
    text = duration.rest
  }

  const deadline = take(text, [
    [
      /\{([^}]*)\}/u,
      m => take(` ${m[1] ?? ''} `, dateRules(today))?.value ?? null
    ]
  ])
  if (deadline) {
    task.deadline = deadline.value
    text = deadline.rest
  }

  const recurrence = take(text, recurrenceRules(today))
  if (recurrence) {
    task.recurrence = recurrence.value.recurrence
    text = recurrence.rest
  }

  const date = take(text, dateRules(today))
  if (date) {
    task.dueDate = date.value
    text = date.rest
  }

  const time = take(text, timeRules)
  if (time) {
    task.dueTime = time.value
    text = time.rest
  }

  if (task.dueDate === undefined && (task.recurrence || task.dueTime)) {
    task.dueDate = recurrence?.value.from ?? today
  }

  task.title = text.replace(/\s+/gu, ' ').trim()
  return task
}
