import dayjs from 'dayjs'

import type { ExportedTask } from '@/application/boards'
import type { Board } from '@/domain/board'
import { parseCsv, toCsv } from '@/domain/csv'
import {
  IMPORT_FIELDS,
  IMPORT_LIMIT,
  IMPORT_MAX_BYTES,
  type ImportField
} from '@/domain/taskImport'
import { taskUrl } from '@/ui/boards/CopyLink'
import { recurrenceLabel } from '@/ui/boards/dueLabel'
import type { useI18n } from '@/ui/i18n/useI18n'

type Translate = ReturnType<typeof useI18n>['t']

const EXPORT_COLUMNS = [
  'key',
  'title',
  'section',
  'done',
  'assignees',
  'labels',
  'priority',
  'dueDate',
  'dueTime',
  'deadline',
  'repeat',
  'parentKey',
  'description',
  'comments',
  'createdAt',
  'createdBy',
  'completedAt',
  'link'
] as const

const moment = (at: string | null) =>
  at ? dayjs(at).format('YYYY-MM-DD HH:mm') : ''

export function exportCsv(
  board: Board,
  tasks: readonly ExportedTask[],
  withArchived: boolean,
  t: Translate
): string {
  const columns = withArchived
    ? [...EXPORT_COLUMNS, 'archived' as const]
    : EXPORT_COLUMNS
  const yesNo = (value: boolean) => t(value ? 'csv.yes' : 'csv.no')
  const keys = new Map(tasks.map(task => [task.id, task.key]))
  const sections = new Map(board.sections.map(each => [each.id, each.name]))
  const cells = (
    task: ExportedTask
  ): Record<(typeof columns)[number], string> => ({
    key: task.key,
    title: task.title,
    section: task.sectionId ? (sections.get(task.sectionId) ?? '') : '',
    done: yesNo(task.completedAt !== null),
    assignees: task.assignees.map(person => person.email).join('; '),
    labels: task.labels.map(label => label.name).join('; '),
    priority: task.priority ? `P${String(task.priority)}` : '',
    dueDate: task.dueDate ?? '',
    dueTime: task.dueTime ?? '',
    deadline: task.deadline ?? '',
    repeat: task.recurrence ? recurrenceLabel(t, task.recurrence) : '',
    parentKey: task.parentId ? (keys.get(task.parentId) ?? '') : '',
    description: task.description,
    comments: String(task.commentCount),
    createdAt: moment(task.createdAt),
    createdBy: task.createdBy?.email ?? '',
    completedAt: moment(task.completedAt),
    link: taskUrl(board.id, task.key, false),
    archived: yesNo(task.archived)
  })
  return toCsv([
    columns.map(column => t(`csv.columns.${column}`)),
    ...tasks.map(task => {
      const row = cells(task)
      return columns.map(column => row[column])
    })
  ])
}

export const exportFileName = (name: string, today: Date): string =>
  `${name.replace(/[\\/:*?"<>|]/g, '-')} ${dayjs(today).format('YYYY-MM-DD')}.csv`

/** The names of the app's own columns, read back on import. */
export const localizedHeaders = (t: Translate): Record<ImportField, string> =>
  Object.fromEntries(
    IMPORT_FIELDS.map(field => [field, t(`csv.columns.${field}`)])
  ) as Record<ImportField, string>

export function download(name: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/csv;charset=utf-8' })
  )
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // Revoked at once, Safari can cancel the download it just started.
  setTimeout(() => {
    URL.revokeObjectURL(url)
  })
}

export type CsvRefusal = 'unreadable' | 'tooLarge' | 'tooMany' | 'empty'

export interface CsvFile {
  name: string
  headers: string[]
  rows: string[][]
}

// Excel saves "CSV" in the system's code page unless asked for UTF-8.
function decode(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

export async function readCsvFile(file: File): Promise<CsvFile | CsvRefusal> {
  if (file.size > IMPORT_MAX_BYTES) return 'tooLarge'
  const parsed = parseCsv(decode(await file.arrayBuffer()))
  if (!parsed) return 'unreadable'
  const [headers, ...rows] = parsed
  if (!headers || rows.length === 0) return 'empty'
  if (rows.length > IMPORT_LIMIT) return 'tooMany'
  return { name: file.name, headers, rows }
}

/** Whether the reader writes the day before the month, as 31/12. */
export const writesDayFirst = (lang: string): boolean => {
  const parts = new Intl.DateTimeFormat(lang).formatToParts(
    new Date(2000, 11, 31)
  )
  const at = (type: string) => parts.findIndex(part => part.type === type)
  return at('day') < at('month')
}
