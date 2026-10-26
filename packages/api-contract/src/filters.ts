import { z } from 'zod'
import { isTimeZone } from './common.ts'

export const newFilter = z.object({
  name: z.string().trim().min(1).max(100),
  criteria: z.strictObject({
    assignee: z
      .array(z.union([z.enum(['me', 'nobody']), z.uuid()]))
      .min(1)
      .max(50)
      .optional(),
    priority: z.array(z.int().min(1).max(4)).min(1).max(4).optional(),
    label: z.array(z.string().trim().min(1).max(50)).min(1).max(50).optional(),
    due: z
      .array(z.enum(['overdue', 'today', 'week', 'none']))
      .min(1)
      .max(4)
      .optional()
  })
})

export const filterChanges = newFilter
  .partial()
  .refine(changes => Object.keys(changes).length > 0)

export const filterParams = z.object({ filterId: z.uuid() })

export const zoneQuery = z.object({
  zone: z.string().max(64).refine(isTimeZone)
})
