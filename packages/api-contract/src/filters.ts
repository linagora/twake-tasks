import { z } from 'zod'
import { isTimeZone } from './common.ts'

const due = z.enum(['overdue', 'today', 'week', 'none'])

export const newFilter = z.object({
  name: z.string().trim().min(1).max(100),
  criteria: z.strictObject({
    board: z.array(z.uuid()).min(1).max(50).optional(),
    assignee: z
      .array(z.union([z.enum(['me', 'nobody']), z.uuid()]))
      .min(1)
      .max(50)
      .optional(),
    priority: z.array(z.int().min(1).max(4)).min(1).max(4).optional(),
    label: z.array(z.string().trim().min(1).max(50)).min(1).max(50).optional(),
    due: z.array(due).min(1).max(4).optional()
  })
})

export const filterChanges = newFilter
  .partial()
  .refine(changes => Object.keys(changes).length > 0)

export const filterParams = z.object({ filterId: z.uuid() })

export const zoneQuery = z.object({
  zone: z.string().max(64).refine(isTimeZone)
})

export const filtersResponse = z.object({
  filters: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      criteria: z.object({
        board: z.array(z.string()).exactOptional(),
        assignee: z.array(z.string()).exactOptional(),
        priority: z.array(z.number()).exactOptional(),
        label: z.array(z.string()).exactOptional(),
        due: z.array(due).exactOptional()
      }),
      favorite: z.boolean()
    })
  )
})

export const createdFilterResponse = z.object({ id: z.string() })

export const labelNamesResponse = z.object({ labels: z.array(z.string()) })
