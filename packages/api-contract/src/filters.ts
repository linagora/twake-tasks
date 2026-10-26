import { z } from 'zod'
import { LAYOUTS } from './boards.ts'
import { isTimeZone } from './common.ts'

/** What the columns of a view are: its tasks' statuses unless chosen. */
export const GROUPINGS = [
  'status',
  'board',
  'assignee',
  'priority',
  'label',
  'due'
] as const

// The criteria of saved filters, by their earlier names: one value, or a list.
const oneOrMany = <T extends z.ZodType>(value: T) =>
  z.union([value, z.array(value).min(1).max(100)]).optional()

export const newFilter = z.object({
  name: z.string().trim().min(1).max(100),
  // Each criterion takes many values; the single ones of earlier views stay
  // understood.
  criteria: z.strictObject({
    assignees: z
      .array(z.union([z.enum(['me', 'nobody']), z.uuid()]))
      .max(100)
      .optional(),
    priorities: z.array(z.int().min(1).max(4)).max(4).optional(),
    labels: z.array(z.string().trim().min(1).max(50)).max(100).optional(),
    dues: z
      .array(z.enum(['overdue', 'today', 'week', 'none']))
      .max(4)
      .optional(),
    boards: z.array(z.uuid()).max(100).optional(),
    statuses: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
    assignee: oneOrMany(z.union([z.enum(['me', 'nobody']), z.uuid()])),
    priority: oneOrMany(z.int().min(1).max(4)),
    label: oneOrMany(z.string().trim().min(1).max(50)),
    due: oneOrMany(z.enum(['overdue', 'today', 'week', 'none'])),
    board: z.uuid().optional()
  }),
  // The name of an icon of the Twake set, which the frontend draws.
  icon: z
    .string()
    .regex(/^[A-Z][A-Za-z0-9]{0,39}$/)
    .nullable()
    .optional(),
  layout: z.enum(LAYOUTS).optional(),
  groupBy: z.enum(GROUPINGS).optional(),
  allColumns: z.boolean().optional()
})

export const filterChanges = newFilter
  .partial()
  .refine(changes => Object.keys(changes).length > 0)

export const filterParams = z.object({ filterId: z.uuid() })

export const zoneQuery = z.object({
  zone: z.string().max(64).refine(isTimeZone)
})
