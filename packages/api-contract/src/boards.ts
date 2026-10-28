import { z } from 'zod'
import { label } from './labels.ts'
import { person, role } from './people.ts'
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

export const newBoard = z.object({
  name: boardName,
  keyPrefix: z.string().regex(/^[A-Z][A-Z0-9]{0,9}$/),
  projectId: z.uuid().optional(),
  language: z.string().max(35).optional()
})

export const boardRename = z.object({ name: boardName })

export const boardParams = z.object({ boardId: z.uuid() })

export const layoutChoice = z.object({ layout: z.enum(LAYOUTS) })

export const boardMove = z.object({ projectId: z.uuid() })

export const boardResponse = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  project: z.object({
    id: z.string(),
    name: z.string(),
    personal: z.boolean(),
    managed: z.boolean()
  }),
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
