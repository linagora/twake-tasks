import type { Logger } from 'pino'
import { z } from 'zod'
import type { Tx } from '../infra/db.ts'
import type { Metrics } from '../infra/metrics.ts'
import type { Deduplicator } from './dedupe.ts'
import {
  parsePlatformEvent,
  type Delivery,
  type PlatformEvent
} from './envelope.ts'

export type Handler<E> = (event: E, tx: Tx, log: Logger) => Promise<void>

// Thrown by a handler for an event it can never process, so it is dropped.
export class MalformedEventError extends Error {}

// Thrown by a handler for a well-formed event that contradicts the copy; kept on
// the dead letter queue to be looked at and replayed.
export class RejectedEventError extends Error {}

// Thrown for an event about a space Tasks does not hold yet: the event that
// brings it may only be late.
export class NotYetKnownError extends Error {
  readonly spaceId: string

  constructor(spaceId: string) {
    super(`space ${spaceId} not known yet`)
    this.spaceId = spaceId
  }
}

export type Park = (
  delivery: Delivery & { messageId: string },
  spaceId: string,
  reason: string
) => Promise<void>

export function parseOrDrop<T extends z.ZodType>(
  schema: T,
  value: unknown,
  label: string
): z.output<T> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new MalformedEventError(`${label}: ${z.prettifyError(result.error)}`)
  }
  return result.data
}

export type Outcome =
  'processed' | 'duplicate' | 'unrouted' | 'malformed' | 'rejected' | 'parked'

export function createMessageHandler(deps: {
  routes: ReadonlyMap<string, Handler<PlatformEvent>>
  dedupe: Deduplicator
  park: Park
  logger: Logger
  metrics?: Metrics | undefined
}) {
  const { routes, dedupe, park, logger, metrics } = deps

  const handle = async (delivery: Delivery): Promise<Outcome> => {
    const context = {
      routingKey: delivery.routingKey,
      messageId: delivery.messageId
    }
    const parsed = parsePlatformEvent(delivery)
    if (!parsed.ok) {
      logger.error(
        { ...context, error: parsed.error },
        'dropping malformed event'
      )
      return 'malformed'
    }
    const event = parsed.event
    const handler = routes.get(event.routingKey)
    if (!handler) {
      logger.debug(context, 'no handler for event')
      return 'unrouted'
    }
    let processed: boolean
    try {
      processed = await dedupe.once(
        { source: 'amqp', id: event.messageId },
        tx => handler(event, tx, logger.child(context))
      )
    } catch (error) {
      if (error instanceof NotYetKnownError) {
        await park(
          { ...delivery, messageId: event.messageId },
          error.spaceId,
          error.message
        )
        logger.info({ ...context, reason: error.message }, 'event parked')
        return 'parked'
      }
      if (error instanceof RejectedEventError) {
        logger.warn(
          { ...context, reason: error.message },
          'event sent to the dead letter queue'
        )
        return 'rejected'
      }
      if (!(error instanceof MalformedEventError)) throw error
      logger.error(
        { ...context, error: error.message },
        'dropping malformed event'
      )
      return 'malformed'
    }
    logger.info({ ...context, duplicate: !processed }, 'event handled')
    return processed ? 'processed' : 'duplicate'
  }

  return async (delivery: Delivery): Promise<Outcome> => {
    const routingKey = routes.has(delivery.routingKey)
      ? delivery.routingKey
      : 'other'
    let outcome: Outcome | 'failed' = 'failed'
    try {
      outcome = await handle(delivery)
      return outcome
    } finally {
      metrics?.eventsConsumed.inc({ routing_key: routingKey, outcome })
    }
  }
}
