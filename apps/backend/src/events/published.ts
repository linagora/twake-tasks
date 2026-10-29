import { z } from 'zod'
import { durationUnit, recurrenceUnit } from '../modules/boards/index.ts'

type ObjectOf = <S extends z.core.$ZodLooseShape>(
  shape: S
) => z.ZodObject<S, z.core.$ZodObjectConfig>

const schemaOf = (strict: boolean) => {
  const object: ObjectOf = strict ? z.strictObject : z.looseObject
  // Open outside tests, since a newer release may add a value.
  const oneOf = <V extends string>(values: readonly [V, ...V[]]) =>
    strict ? z.enum(values) : z.string()
  const one = <T extends z.ZodType>(item: T) =>
    strict ? z.tuple([item]) : z.array(item)

  const envelope = {
    specversion: z.literal('1.0'),
    id: z.string(),
    source: z.literal('twake://tasks'),
    time: z.string().optional(),
    twakeorg: z.string().optional(),
    twakeactor: z.string().optional(),
    twakeactorid: z.string().optional(),
    twakecorrelationid: z.string().optional()
  }

  const task = object({
    type: z.literal('task'),
    id: z.string(),
    key: z.string(),
    title: z.string(),
    board: object({ id: z.string(), name: z.string() }),
    container: object({ kind: oneOf(['project']), id: z.string() })
  })

  const recipient = <R extends string>(reason: R) =>
    object({
      uuid: z.string(),
      email: z.string(),
      reason: oneOf([reason])
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
            unit: oneOf(durationUnit.enumValues)
          }).nullable()
        ),
        recurrence: change(
          object({
            every: z.int(),
            unit: oneOf(recurrenceUnit.enumValues),
            fromCompletion: z.boolean()
          }).nullable()
        ),
        completion: change(oneOf(['completed', 'canceled']).nullable()),
        description: change(z.null()),
        labels: change(z.string().nullable())
      }).partial()
    }),
    taskEvent('completed', {}),
    taskEvent('reopened', {}),
    taskEvent('assigned', {
      assignee: object({ id: z.string() }),
      recipients: one(recipient('assigned')).optional()
    }),
    taskEvent('unassigned', {
      assignee: object({ id: z.string() })
    }),
    taskEvent('deleted', {}),
    taskEvent('restored', {}),
    taskEvent('commented', {
      recipients: one(recipient('mentioned'))
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
        resource: object({ kind: oneOf(['project']), id: z.string() })
      })
    })
  ])
}

// Loose, so a replica still on the previous release relays a field or value
// added since instead of dropping its event.
export const publishedEvent = schemaOf(false)

// For tests, so a field added to an event without its schema fails them.
export const strictPublishedEvent = schemaOf(true)

// A type added since the previous release is relayed unchecked.
export const isKnownType = (type: unknown) =>
  publishedEvent.options.some(option => option.shape.type.value === type)

export type PublishedEvent = z.infer<typeof publishedEvent>
