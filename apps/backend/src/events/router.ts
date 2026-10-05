import type { Logger } from 'pino'
import type { Tx } from '../infra/db.ts'
import type { Deduplicator, EventKey } from './dedupe.ts'
import {
  PLATFORM_TOPIC,
  parseCloudEvent,
  parsePlatformEvent,
  type CloudEvent,
  type ParseResult,
  type PlatformEvent
} from './envelope.ts'

export type Handler<E> = (event: E, tx: Tx) => Promise<void>

export interface Routes {
  activity: ReadonlyMap<string, Handler<CloudEvent>>
  platform: ReadonlyMap<string, Handler<PlatformEvent>>
}

export interface IncomingMessage {
  value: Buffer | null
  offset: string
  headers?: Record<string, unknown>
}

export type Outcome = 'processed' | 'duplicate' | 'unrouted' | 'malformed'

export function createMessageHandler(deps: {
  routes: Routes
  dedupe: Deduplicator
  logger: Logger
}) {
  const { routes, dedupe, logger } = deps

  async function dispatch<E>(
    topic: string,
    message: IncomingMessage,
    parsed: ParseResult<E>,
    route: (event: E) => {
      key: string
      handler: Handler<E> | undefined
      dedupeKey: EventKey
    }
  ): Promise<Outcome> {
    const context = { topic, offset: message.offset }
    if (!parsed.ok) {
      logger.error(
        { ...context, error: parsed.error },
        'dropping malformed event'
      )
      return 'malformed'
    }
    const { key, handler, dedupeKey } = route(parsed.event)
    if (!handler) {
      logger.debug({ ...context, key }, 'no handler for event')
      return 'unrouted'
    }
    const processed = await dedupe.once(dedupeKey, tx =>
      handler(parsed.event, tx)
    )
    logger.info(
      { ...context, key, ...dedupeKey, duplicate: !processed },
      'event handled'
    )
    return processed ? 'processed' : 'duplicate'
  }

  return (topic: string, message: IncomingMessage): Promise<Outcome> =>
    topic === PLATFORM_TOPIC
      ? dispatch(
          topic,
          message,
          parsePlatformEvent(message.value, message.headers),
          event => ({
            key: event.routingKey,
            handler: routes.platform.get(event.routingKey),
            dedupeKey: { source: 'amqp', id: event.messageId }
          })
        )
      : dispatch(topic, message, parseCloudEvent(message.value), event => ({
          key: event.type,
          handler: routes.activity.get(event.type),
          dedupeKey: { source: event.source, id: event.id }
        }))
}
