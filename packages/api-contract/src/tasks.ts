import { z } from 'zod'
import { instant, isTimeZone } from './common.ts'
import { label } from './labels.ts'
import { person } from './people.ts'
import { category } from './sections.ts'

export const DURATION_UNITS = ['minutes', 'days'] as const

export const RECURRENCE_UNITS = ['days', 'weeks', 'months', 'years'] as const

export const taskTitle = z.string().trim().min(1).max(500)

export const newTask = z.union([
  z.strictObject({
    sectionId: z.uuid().nullable(),
    title: taskTitle,
    templateId: z.uuid().optional()
  }),
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

const nonEmpty = (changes: object) => Object.keys(changes).length > 0

const taskFields = z.object({
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

export const taskChanges = taskFields.partial().refine(nonEmpty)

export const assignment = z.object({ userIds: z.array(z.uuid()).max(50) })

export const duplicate = z.strictObject({ title: taskTitle })

export const transferTarget = z.object({
  boardId: z.uuid(),
  sectionId: z.uuid().nullable()
})

const BULK_LIMIT = 200

const bulkTasks = z.array(z.uuid()).min(1).max(BULK_LIMIT)

const bulkAction = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('move'), sectionId: z.uuid().nullable() }),
  z.strictObject({
    kind: z.literal('assign'),
    userId: z.uuid(),
    assigned: z.boolean()
  }),
  z.strictObject({
    kind: z.literal('label'),
    labelId: z.uuid(),
    labeled: z.boolean()
  }),
  z.strictObject({
    kind: z.literal('edit'),
    changes: taskFields
      .pick({
        priority: true,
        dueDate: true,
        dueTime: true,
        dueZone: true,
        recurrence: true
      })
      .partial()
      .strict()
      .refine(nonEmpty)
  }),
  z.strictObject({ kind: z.enum(['archive', 'trash', 'restore']) }),
  z.strictObject({ kind: z.literal('transfer'), to: transferTarget })
])

export const bulkChange = z.object({ taskIds: bulkTasks, action: bulkAction })

export const bulkTransferPreview = z.object({
  taskIds: bulkTasks,
  to: transferTarget
})

/** The tasks left unchanged, each refused on its own. */
export const bulkResponse = z.object({ failed: z.array(z.string()) })

export const descriptionEdit = z.object({
  markdown: z.string().max(50_000),
  version: z.int().min(0)
})

// Without a status, search finds tasks whatever their state.
export const searchQuery = z.object({
  q: z.string().trim().max(200),
  status: z.enum(['open', 'done']).optional(),
  board: z.uuid().optional()
})

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
  template: z.object({ id: z.string(), title: z.string() }).nullable(),
  completedAt: instant.nullable(),
  canceledAt: instant.nullable(),
  assignees: z.array(person),
  labels: z.array(label),
  commentCount: z.number(),
  /** The tasks not done yet that block it, null for one the person cannot open. */
  blockers: z.array(z.object({ key: z.string(), title: z.string() }).nullable())
})

export const createdTaskResponse = taskResponse.pick({
  id: true,
  key: true,
  title: true,
  sectionId: true
})

/** `at` is when the task was archived or trashed. */
export const hiddenTasksResponse = z.object({
  tasks: z.array(taskResponse.extend({ at: instant }))
})

const agendaTask = taskResponse.extend({
  category: category.nullable(),
  parentTitle: z.string().nullable(),
  boardId: z.string(),
  boardName: z.string(),
  projectId: z.string()
})

export const tasksResponse = z.object({ tasks: z.array(agendaTask) })

export const agendaResponse = tasksResponse.extend({ today: z.iso.date() })

// What a result answers the search by: its key, a former key, its title, or
// the part of its description or of one of its comments around the text.
export const searchMatch = z.union([
  z.object({
    field: z.enum(['key', 'previousKey', 'title', 'description']),
    text: z.string()
  }),
  z.object({
    field: z.literal('comment'),
    text: z.string(),
    commentId: z.string(),
    author: person
  })
])

export const searchResponse = z.object({
  tasks: z.array(
    agendaTask.extend({
      excerpt: z.string().nullable(),
      match: searchMatch.nullable()
    })
  )
})

export const descriptionResponse = z.object({
  markdown: z.string(),
  version: z.number()
})

export const descriptionVersionResponse = descriptionResponse.pick({
  version: true
})

export const transferPreviewResponse = z.object({
  droppedAssignees: z.array(
    z.object({
      userId: z.string(),
      name: z.string().nullable(),
      email: z.string().nullable()
    })
  ),
  createdLabels: z.array(z.string())
})

export const transferResponse = transferPreviewResponse.extend({
  key: z.string()
})
