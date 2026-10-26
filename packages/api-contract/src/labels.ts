import { z } from 'zod'
import { uniqueName } from './common.ts'

export const labelName = uniqueName(50)

export const labelColor = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .transform(color => color.toUpperCase())
  .nullable()

export const newLabel = z.object({
  name: labelName,
  color: labelColor.optional()
})

export const labelParams = z.object({ boardId: z.uuid(), labelId: z.uuid() })

export const labelChanges = z
  .object({ name: labelName, color: labelColor })
  .partial()
  .refine(changes => Object.keys(changes).length > 0)

export const labeling = z.object({ labelIds: z.array(z.uuid()).max(50) })
