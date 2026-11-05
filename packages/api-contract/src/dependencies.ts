import { z } from 'zod'
import { taskParams } from './tasks.ts'

export const newLink = z.strictObject({
  kind: z.enum(['blockedBy', 'blocks']),
  taskId: z.uuid()
})

export const linkParams = taskParams.extend({ otherId: z.uuid() })

/** `task` is null for a task on a board the person cannot open. */
const linkedTask = z.object({
  taskId: z.string(),
  task: z
    .object({
      key: z.string(),
      title: z.string(),
      boardId: z.string(),
      boardName: z.string(),
      section: z.string().nullable(),
      dueDate: z.iso.date().nullable(),
      done: z.boolean()
    })
    .nullable()
})

export const linksResponse = z.object({
  blockedBy: z.array(linkedTask),
  blocks: z.array(linkedTask)
})
