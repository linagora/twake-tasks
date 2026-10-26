import { z } from 'zod'
import { durationUnit, recurrenceUnit } from '../modules/boards/schema.ts'

type ObjectOf = <S extends z.core.$ZodLooseShape>(
  shape: S
) => z.ZodObject<S, z.core.$ZodObjectConfig>

const schemaOf = (object: ObjectOf) => {
  const envelope = {
    specversion: z.literal('1.0'),
    id: z.string(),
    source: z.literal('twake://tasks'),
    time: z.string().optional(),
    twakeorg: z.string().optional(),
    twakeactor: z.string().optional(),
    twakeactorid: z.string().optional()
  }

  const task = object({
    type: z.literal('task'),
    id: z.string(),
    key: z.string(),
    title: z.string(),
    board: object({ id: z.string(), name: z.string() }),
    container: object({ kind: z.literal('project'), id: z.string() })
  })

  const recipient = <R extends string>(reason: R) =>
    object({
      uuid: z.string(),
      email: z.string(),
      reason: z.literal(reason)
    })

  const change = <T extends z.ZodType>(value: T) =>
    object({ from: value, to: value })

  const taskEvent = <A extends string, D extends z.core.$ZodLooseShape>(
    action: A,
    data: D
  ) =>
    object({
      ...envelope,
      type: z.literal(`com.twake.tasks.task.${action}.v1`),
      data: object({ object: task, ...data })
    })

  return z.discriminatedUnion('type', [
    taskEvent('created', {}),
    taskEvent('updated', {
      changes: object({
        title: change(z.string()),
        priority: change(z.int().nullable()),
        dueDate: change(z.string().nullable()),
        deadline: change(z.string().nullable()),
        duration: change(
          object({
            amount: z.int(),
            unit: z.enum(durationUnit.enumValues)
          }).nullable()
        ),
        recurrence: change(
          object({
            every: z.int(),
            unit: z.enum(recurrenceUnit.enumValues),
            fromCompletion: z.boolean()
          }).nullable()
        ),
        completion: change(z.enum(['completed', 'canceled']).nullable()),
        description: change(z.null()),
        labels: change(z.string().nullable())
      }).partial()
    }),
    taskEvent('completed', {}),
    taskEvent('reopened', {}),
    taskEvent('assigned', {
      assignee: object({ id: z.string() }),
      recipients: z.tuple([recipient('assigned')]).optional()
    }),
    taskEvent('unassigned', {
      assignee: object({ id: z.string() })
    }),
    taskEvent('deleted', {}),
    taskEvent('restored', {}),
    taskEvent('commented', {
      recipients: z.tuple([recipient('mentioned')])
    }),
    taskEvent('moved', {
      changes: object({
        board: change(z.string()).optional(),
        section: change(z.string().nullable())
      })
    }),
    object({
      ...envelope,
      type: z.literal('com.twake.tasks.space.provisioned.v1'),
      data: object({
        space_id: z.string(),
        resource: object({ kind: z.literal('project'), id: z.string() })
      })
    })
  ])
}

// Loose, so a replica still on the previous release relays a field added since
// instead of dropping its event.
export const publishedEvent = schemaOf(z.looseObject)

// For tests, so a field added to an event without its schema fails them.
export const strictPublishedEvent = schemaOf(z.strictObject)

export type PublishedEvent = z.infer<typeof publishedEvent>
