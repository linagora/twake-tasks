import { z } from 'zod'

export const PLATFORM_TOPIC = 'twake.platform.events.v1'
export const TASKS_TOPIC = 'twake.tasks.events.v1'

const cloudEvent = z.looseObject({
  specversion: z.literal('1.0'),
  id: z.string().min(1),
  source: z.string().min(1),
  type: z.string().min(1),
  time: z.iso.datetime({ offset: true }).optional(),
  subject: z.string().optional(),
  twakeorg: z.string().min(1).optional(),
  twakeactor: z.email(),
  data: z.looseObject({
    object: z.looseObject({ space_id: z.uuid().optional() })
  })
})

export type CloudEvent = z.infer<typeof cloudEvent>

export interface PlatformEvent {
  routingKey: string
  messageId: string
  body: unknown
}

export type ParseResult<T> =
  { ok: true; event: T } | { ok: false; error: string }

export function parseCloudEvent(
  value: Buffer | string | null
): ParseResult<CloudEvent> {
  const json = parseJson(value)
  if (!json.ok) return json
  const result = cloudEvent.safeParse(json.event)
  return result.success
    ? { ok: true, event: result.data }
    : { ok: false, error: z.prettifyError(result.error) }
}

export function parsePlatformEvent(
  value: Buffer | string | null,
  headers: Record<string, unknown> = {}
): ParseResult<PlatformEvent> {
  const routingKey = headerString(headers.amqp_routing_key)
  const messageId = headerString(headers.amqp_message_id)
  if (!routingKey || !messageId) {
    return {
      ok: false,
      error: 'missing amqp_routing_key or amqp_message_id header'
    }
  }
  const json = parseJson(value)
  if (!json.ok) return json
  return { ok: true, event: { routingKey, messageId, body: json.event } }
}

function parseJson(value: Buffer | string | null): ParseResult<unknown> {
  if (value === null) return { ok: false, error: 'empty message' }
  try {
    return { ok: true, event: JSON.parse(value.toString()) as unknown }
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${(error as Error).message}` }
  }
}

function headerString(value: unknown): string | undefined {
  const first: unknown = Array.isArray(value) ? value[0] : value
  if (Buffer.isBuffer(first)) return first.toString()
  return typeof first === 'string' ? first : undefined
}
