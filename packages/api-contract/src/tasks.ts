import { z } from 'zod'
import { isTimeZone } from './common.ts'
import { label } from './labels.ts'
import { person } from './people.ts'

export const DURATION_UNITS = ['minutes', 'days'] as const

export const RECURRENCE_UNITS = ['days', 'weeks', 'months', 'years'] as const

export const taskTitle = z.string().trim().min(1).max(500)

export const newTask = z.union([
  z.strictObject({ sectionId: z.uuid().nullable(), title: taskTitle }),
  z.strictObject({ parentId: z.uuid(), title: taskTitle })
])

export const completion = z.object({
  state: z.enum(['completed', 'canceled']).nullable()
})

export const taskParams = z.object({ boardId: z.uuid(), taskId: z.uuid() })

export const taskMove = z.object({
  sectionId: z.uuid().nullable(),
  afterId: z.uuid().optional(),
  beforeId: z.uuid().optional()
})

export const taskChanges = z
  .object({
    title: taskTitle,
    priority: z.int().min(1).max(4).nullable(),
    dueDate: z.iso.date().nullable(),
    dueTime: z.iso.time({ precision: -1 }).nullable(),
    dueZone: z.string().max(64).refine(isTimeZone).nullable(),
    deadline: z.iso.date().nullable(),
    duration: z
      .object({
        amount: z.int().min(1).max(100_000),
        unit: z.enum(DURATION_UNITS)
      })
      .nullable(),
    recurrence: z
      .object({
        every: z.int().min(1).max(1000),
        unit: z.enum(RECURRENCE_UNITS),
        fromCompletion: z.boolean()
      })
      .nullable()
  })
  .partial()
  .refine(changes => Object.keys(changes).length > 0)

export const assignment = z.object({ userIds: z.array(z.uuid()).max(50) })

export const transferTarget = z.object({
  boardId: z.uuid(),
  sectionId: z.uuid().nullable()
})

export const descriptionEdit = z.object({
  markdown: z.string().max(50_000),
  version: z.int().min(0)
})

export const searchQuery = z.object({ q: z.string().trim().max(200) })

export const agendaQuery = z.object({
  zone: z.string().max(64).refine(isTimeZone),
  days: z.coerce.number().int().min(1).max(60)
})

export const taskResponse = z.object({
  id: z.string(),
  key: z.string(),
  sectionId: z.string().nullable(),
  parentId: z.string().nullable(),
  title: z.string(),
  priority: z.literal([1, 2, 3, 4]).nullable(),
  dueDate: z.iso.date().nullable(),
  dueTime: z.iso.time({ precision: -1 }).nullable(),
  dueZone: z.string().nullable(),
  deadline: z.iso.date().nullable(),
  duration: z
    .object({ amount: z.number(), unit: z.enum(DURATION_UNITS) })
    .nullable(),
  recurrence: z
    .object({
      every: z.number(),
      unit: z.enum(RECURRENCE_UNITS),
      fromCompletion: z.boolean()
    })
    .nullable(),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
  canceledAt: z.iso.datetime({ offset: true }).nullable(),
  assignees: z.array(person),
  labels: z.array(label),
  commentCount: z.number()
})
