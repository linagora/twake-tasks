import { z } from 'zod'
import { instant } from './common.ts'
import { label } from './labels.ts'
import { person, role } from './people.ts'
import { projectSummary } from './projects.ts'
import { section } from './sections.ts'
import { taskResponse } from './tasks.ts'

export const LAYOUTS = ['board', 'list', 'calendar', 'progress'] as const

// No control or format characters (newlines, bidi overrides, invisibles),
// except the joiner of emoji sequences.
export const boardName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(name => !/(?!\u200D)[\p{Cc}\p{Cf}]/u.test(name))

export const keyPrefix = z.string().regex(/^[A-Z][A-Z0-9]{0,9}$/)

export const newBoard = z.object({
  name: boardName,
  keyPrefix,
  projectId: z.uuid().optional(),
  language: z.string().max(35).optional(),
  copyOf: z
    .object({
      boardId: z.uuid(),
      tasks: z.boolean(),
      assignees: z.boolean(),
      dueDates: z.boolean()
    })
    .optional()
})

export const boardRename = z.object({ name: boardName })

export const keyPrefixParams = z.object({ keyPrefix })

export const keyPrefixResponse = z.object({
  available: z.boolean(),
  suggestion: keyPrefix
})

export const boardParams = z.object({ boardId: z.uuid() })

export const layoutChoice = z.object({ layout: z.enum(LAYOUTS) })

/** The pictures shipped as boards' backgrounds, and one sent by an admin. */
export const BACKGROUNDS = [
  'orbitalblue',
  'earlymorning',
  'dawn',
  'stellarburst',
  'eclipse',
  'stripes',
  'custom'
] as const

/** A plain color as a board's cover, in six hex digits. */
export const backgroundColor = z.string().regex(/^#[0-9A-F]{6}$/i)

/** A shipped picture, none, or a plain color. */
export const backgroundChoice = z.union([
  z.strictObject({
    background: z.enum(BACKGROUNDS).exclude(['custom']).nullable()
  }),
  z.strictObject({ color: backgroundColor })
])

export const backgroundImageParams = z.object({
  boardId: z.uuid(),
  imageId: z.uuid()
})

export const boardMove = z.object({ projectId: z.uuid() })

// The cover of a board, as a board and the boards list give it.
const cover = {
  background: z.enum(BACKGROUNDS).nullable(),
  backgroundImage: z.string().nullable(),
  backgroundColor: z.string().nullable()
}

export const boardResponse = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  project: projectSummary,
  inbox: z.boolean(),
  archived: z.boolean(),
  version: z.number(),
  role,
  layout: z.enum(LAYOUTS),
  defaultLayout: z.enum(LAYOUTS),
  boardTemplate: z.boolean(),
  ...cover,
  members: z.array(person),
  invited: z.array(z.string()),
  labels: z.array(label),
  sections: z.array(section),
  tasks: z.array(taskResponse)
})

// Eight weeks, wherever the reader's week starts: today and the 55 days before.
export const PROGRESS_DAYS = 56

// The days of that span, in the reader's zone, on which tasks were completed.
export const progressResponse = z.object({
  days: z.array(z.object({ day: z.iso.date(), done: z.number() }))
})

export const boardsResponse = z.object({
  boards: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      keyPrefix: z.string(),
      project: projectSummary,
      inbox: z.boolean(),
      role,
      joinedAt: instant,
      sharedBy: z
        .object({ name: z.string().nullable(), email: z.string() })
        .nullable(),
      archived: z.boolean(),
      boardTemplate: z.boolean(),
      favorite: z.boolean(),
      openTasks: z.number(),
      doneTasks: z.number(),
      totalTasks: z.number(),
      lateTasks: z.number(),
      members: z.array(person),
      memberCount: z.number(),
      ...cover
    })
  )
})
