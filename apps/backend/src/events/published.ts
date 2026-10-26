import { z } from 'zod'
import { durationUnit, recurrenceUnit } from '../modules/boards/schema.ts'

// Loose, so a replica still on the previous release relays a field added since
// instead of dropping its event.

const envelope = {
  specversion: z.literal('1.0'),
  id: z.string(),
  source: z.literal('twake://tasks'),
  time: z.string().optional(),
  twakeorg: z.string().optional(),
  twakeactor: z.string().optional(),
  twakeactorid: z.string().optional()
}

const task = z.looseObject({
  type: z.literal('task'),
  id: z.string(),
  key: z.string(),
  title: z.string(),
  board: z.looseObject({ id: z.string(), name: z.string() }),
  container: z.looseObject({ kind: z.literal('project'), id: z.string() })
})

const recipient = <R extends string>(reason: R) =>
  z.looseObject({
    uuid: z.string(),
    email: z.string(),
    reason: z.literal(reason)
  })

const change = <T extends z.ZodType>(value: T) =>
  z.looseObject({ from: value, to: value })

const taskEvent = <A extends string, D extends z.core.$ZodLooseShape>(
  action: A,
  data: D
) =>
  z.looseObject({
    ...envelope,
    type: z.literal(`com.twake.tasks.task.${action}.v1`),
    data: z.looseObject({ object: task, ...data })
  })

export const publishedEvent = z.discriminatedUnion('type', [
  taskEvent('created', {}),
  taskEvent('updated', {
    changes: z
      .looseObject({
        title: change(z.string()),
        priority: change(z.int().nullable()),
        dueDate: change(z.string().nullable()),
        deadline: change(z.string().nullable()),
        duration: change(
          z
            .looseObject({
              amount: z.int(),
              unit: z.enum(durationUnit.enumValues)
            })
            .nullable()
        ),
        recurrence: change(
          z
            .looseObject({
              every: z.int(),
              unit: z.enum(recurrenceUnit.enumValues),
              fromCompletion: z.boolean()
            })
            .nullable()
        ),
        completion: change(z.enum(['completed', 'canceled']).nullable()),
        description: change(z.null()),
        labels: change(z.string().nullable())
      })
      .partial()
  }),
  taskEvent('completed', {}),
  taskEvent('reopened', {}),
  taskEvent('assigned', {
    assignee: z.looseObject({ id: z.string() }),
    recipients: z.tuple([recipient('assigned')]).optional()
  }),
  taskEvent('unassigned', {
    assignee: z.looseObject({ id: z.string() })
  }),
  taskEvent('deleted', {}),
  taskEvent('restored', {}),
  taskEvent('commented', {
    recipients: z.tuple([recipient('mentioned')])
  }),
  taskEvent('moved', {
    changes: z.looseObject({
      board: change(z.string()).optional(),
      section: change(z.string().nullable())
    })
  }),
  z.looseObject({
    ...envelope,
    type: z.literal('com.twake.tasks.space.provisioned.v1'),
    data: z.looseObject({
      space_id: z.string(),
      resource: z.looseObject({ kind: z.literal('project'), id: z.string() })
    })
  })
])

export type PublishedEvent = z.infer<typeof publishedEvent>
