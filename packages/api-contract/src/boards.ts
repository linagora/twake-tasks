import { z } from 'zod'
import { instant } from './common.ts'
import { label } from './labels.ts'
import { person, role } from './people.ts'
import { projectSummary } from './projects.ts'
import { section } from './sections.ts'
import { taskResponse } from './tasks.ts'

export const LAYOUTS = ['board', 'list', 'calendar'] as const

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
  language: z.string().max(35).optional()
})

export const boardRename = z.object({ name: boardName })

export const keyPrefixParams = z.object({ keyPrefix })

// `suggestion` is the prefix asked for when it is free, else a free one close to it.
export const keyPrefixResponse = z.object({
  available: z.boolean(),
  suggestion: keyPrefix
})

export const boardParams = z.object({ boardId: z.uuid() })

export const layoutChoice = z.object({ layout: z.enum(LAYOUTS) })

export const boardMove = z.object({ projectId: z.uuid() })

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
  members: z.array(person),
  invited: z.array(z.string()),
  labels: z.array(label),
  sections: z.array(section),
  tasks: z.array(taskResponse)
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
      favorite: z.boolean(),
      openTasks: z.number(),
      doneTasks: z.number(),
      totalTasks: z.number(),
      members: z.array(person),
      memberCount: z.number()
    })
  )
})
