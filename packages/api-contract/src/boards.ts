import { z } from 'zod'

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
