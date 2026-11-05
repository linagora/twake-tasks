import { z } from 'zod'
import { instant } from './common.ts'
import { person } from './people.ts'
import { taskResponse, taskTitle } from './tasks.ts'

export const IMPORT_LIMIT = 1000

export const exportQuery = z.object({
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform(archived => archived === 'true')
})

/** The board's tasks in board order, each sub-task after its parent. */
export const exportResponse = z.object({
  tasks: z.array(
    taskResponse.extend({
      archived: z.boolean(),
      description: z.string(),
      createdAt: instant,
      createdBy: person.nullable()
    })
  )
})

// Sections, labels and assignees are named as in the file. `key` is the row's
// key in the file, which another row's `parentKey` may point to.
export const importRow = z.strictObject({
  key: z.string().trim().max(50).optional(),
  parentKey: z.string().trim().max(50).optional(),
  title: taskTitle,
  section: z.string().max(100).optional(),
  description: z.string().max(50_000).optional(),
  assignees: z.array(z.string().trim().max(320)).max(50).optional(),
  labels: z.array(z.string().max(50)).max(50).optional(),
  priority: z.int().min(1).max(4).optional(),
  dueDate: z.iso.date().optional(),
  dueTime: z.iso.time({ precision: -1 }).optional()
})

export const boardImport = z.object({
  rows: z.array(importRow).min(1).max(IMPORT_LIMIT)
})

export const importResponse = z.object({
  imported: z.number(),
  /** Rows whose parent is not on the board or in the file, or too deep. */
  skipped: z.array(z.object({ row: z.number(), reason: z.literal('parent') })),
  /** Assignees who are not members of the board, left out. */
  unknownAssignees: z.array(z.string()),
  /** Sections only an admin may add: their tasks went where new tasks go. */
  unplacedSections: z.array(z.string())
})
