import type { Priority } from '@/domain/board'

export const IMPORT_LIMIT = 1000
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024

export const IMPORT_FIELDS = [
  'title',
  'section',
  'description',
  'assignees',
  'labels',
  'priority',
  'dueDate',
  'dueTime',
  'key',
  'parentKey'
] as const

export type ImportField = (typeof IMPORT_FIELDS)[number]

/** The column each field is read from. */
export type Mapping = Partial<Record<ImportField, number | undefined>>

export type SkipReason = 'title' | 'description' | 'date' | 'time' | 'priority'

export interface ImportedRow {
  key?: string
  parentKey?: string
  title: string
  section?: string
  description?: string
  assignees?: string[]
  labels?: string[]
  priority?: Priority
  dueDate?: string
  dueTime?: string
}

// Header names in English and as Trello, Planner, Asana and Jira export them.
const KNOWN_HEADERS: Record<ImportField, string[]> = {
  title: ['title', 'name', 'card name', 'task name', 'task', 'summary'],
  section: [
    'section',
    'list',
    'list name',
    'bucket',
    'bucket name',
    'column',
    'status'
  ],
  description: ['description', 'card description', 'notes'],
  assignees: ['assignees', 'assignee', 'assigned to', 'members', 'owner'],
  labels: ['labels', 'label', 'tags'],
  priority: ['priority'],
  dueDate: ['due date', 'due', 'due on'],
  dueTime: ['due time'],
  key: ['key', 'card id', 'task id', 'issue key'],
  parentKey: ['parent key', 'parent', 'parent task', 'parent id']
}

const folded = (header: string): string =>
  header
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim()

/**
 * Which column holds which field, from the header names: `localized` are the
 * names of the app's own export in the reader's language.
 */
export function guessMapping(
  headers: readonly string[],
  localized: Partial<Record<ImportField, string>>
): Mapping {
  const mapping: Mapping = {}
  const taken = new Set<number>()
  for (const field of IMPORT_FIELDS) {
    const names = new Set(
      [...KNOWN_HEADERS[field], localized[field] ?? ''].map(folded)
    )
    const column = headers.findIndex(
      (header, index) => !taken.has(index) && names.has(folded(header))
    )
    if (column >= 0) {
      mapping[field] = column
      taken.add(column)
    }
  }
  return mapping
}

const PRIORITIES: Record<string, Priority> = {
  urgent: 1,
  highest: 1,
  critical: 1,
  high: 2,
  important: 2,
  medium: 3,
  normal: 3,
  low: 4,
  lowest: 4
}

function priorityOf(value: string): Priority | null {
  const match = /^p?([1-4])$/i.exec(value)
  if (match) return Number(match[1]) as Priority
  return PRIORITIES[value.toLowerCase()] ?? null
}

const pad = (value: number) => String(value).padStart(2, '0')

const isDay = (year: number, month: number, day: number): boolean => {
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    year >= 1000 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

const dayOf = (year: number, month: number, day: number) =>
  isDay(year, month, day) ? `${String(year)}-${pad(month)}-${pad(day)}` : null

/**
 * A due date with the time it may carry. Day and month written as numbers
 * follow the reader's order when the day does not tell them apart.
 */
export function dueOf(
  value: string,
  dayFirst: boolean
): { date: string; time: string | null } | null {
  const iso =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?))?/i.exec(
      value
    )
  // A moment with its zone, as Trello and Asana write it, falls on the
  // reader's own day.
  if (iso && /(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    const moment = new Date(value)
    if (Number.isNaN(moment.getTime())) return null
    return {
      date: `${String(moment.getFullYear())}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`,
      time: `${pad(moment.getHours())}:${pad(moment.getMinutes())}`
    }
  }
  if (iso) {
    const date = dayOf(Number(iso[1]), Number(iso[2]), Number(iso[3]))
    const time = iso[4] ? timeOf(iso[4]) : null
    return date ? { date, time } : null
  }
  const numeric =
    /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:,? (\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?))?/i.exec(
      value
    )
  if (!numeric) return null
  const [first, second] = [Number(numeric[1]), Number(numeric[2])]
  const swap = first > 12 ? true : second > 12 ? false : dayFirst
  const date = swap
    ? dayOf(Number(numeric[3]), second, first)
    : dayOf(Number(numeric[3]), first, second)
  const time = numeric[4] ? timeOf(numeric[4]) : null
  return date ? { date, time } : null
}

export function timeOf(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(value)
  if (!match) return null
  const meridiem = match[3]?.toLowerCase()
  let hours = Number(match[1])
  const minutes = Number(match[2])
  if (meridiem) {
    if (hours < 1 || hours > 12) return null
    hours = (hours % 12) + (meridiem === 'pm' ? 12 : 0)
  }
  return hours < 24 && minutes < 60 ? `${pad(hours)}:${pad(minutes)}` : null
}

const list = (value: string): string[] =>
  value
    .split(/[;,\n]/)
    .map(each => each.trim())
    .filter(each => each !== '')

const MAX_TITLE = 500
const MAX_DESCRIPTION = 50_000
const MAX_LINKS = 50
const MAX_KEY = 50
const MAX_SECTION = 100
const MAX_LABEL = 50

export function readRow(
  cells: readonly string[],
  mapping: Mapping,
  dayFirst: boolean
): { row: ImportedRow } | { skipped: SkipReason } {
  const cell = (field: ImportField) => {
    const column = mapping[field]
    return column === undefined ? '' : (cells[column] ?? '').trim()
  }
  const title = cell('title').replace(/\s+/g, ' ')
  if (title === '' || title.length > MAX_TITLE) return { skipped: 'title' }
  const row: ImportedRow = { title }
  const description = cell('description')
  if (description.length > MAX_DESCRIPTION) return { skipped: 'description' }
  if (description !== '') row.description = description
  const section = cell('section')
  if (section !== '') row.section = section.slice(0, MAX_SECTION)
  const assignees = list(cell('assignees')).filter(each => each.length <= 320)
  if (assignees.length > 0) row.assignees = assignees.slice(0, MAX_LINKS)
  const labels = list(cell('labels')).map(each => each.slice(0, MAX_LABEL))
  if (labels.length > 0) row.labels = labels.slice(0, MAX_LINKS)
  const priority = cell('priority')
  if (priority !== '') {
    const level = priorityOf(priority)
    if (level === null) return { skipped: 'priority' }
    row.priority = level
  }
  const due = cell('dueDate')
  const dueTime = cell('dueTime')
  if (due !== '') {
    const parsed = dueOf(due, dayFirst)
    if (!parsed) return { skipped: 'date' }
    row.dueDate = parsed.date
    const time = dueTime === '' ? parsed.time : timeOf(dueTime)
    if (dueTime !== '' && time === null) return { skipped: 'time' }
    if (time) row.dueTime = time
  } else if (dueTime !== '') return { skipped: 'time' }
  const key = cell('key')
  if (key !== '' && key.length <= MAX_KEY) row.key = key
  const parentKey = cell('parentKey')
  if (parentKey !== '' && parentKey.length <= MAX_KEY) row.parentKey = parentKey
  return { row }
}
