import { DeadLetterError, RabbitMQClient } from '@linagora/rabbitmq-client'
import type { Logger } from 'pino'
import type { Outcome } from '../events/router.ts'

export const QUEUE = 'platform.all.twake-tasks'
export const DEAD_LETTER_QUEUE = `${QUEUE}.dlq`

export interface Delivery {
  routingKey: string
  messageId: string | undefined
  body: unknown
}

export interface Consumer {
  close(): Promise<void>
}

// One message at a time on a single active consumer, so the events of a space
// are handled in the order ldap-rest published them, even with several replicas.
// A failing event is retried until it succeeds rather than skipped, since the
// events behind it may depend on it.
export async function startConsumer(
  url: string,
  logger: Logger,
  handle: (delivery: Delivery) => Promise<Outcome>
): Promise<Consumer> {
  const client = new RabbitMQClient({ url, logger, prefetch: 1 })
  await client.init()
  await client.subscribe(
    'space',
    'twake.space.#',
    QUEUE,
    async (body, { routingKey, messageId }) => {
      const outcome = await handle({ routingKey, messageId, body })
      if (outcome === 'rejected') {
        throw new DeadLetterError(`${routingKey} rejected`)
      }
    },
    {
      bindings: [
        { exchange: 'b2b', routingKey: 'domain.user.deleted' },
        { exchange: 'auth', routingKey: 'user.deleted' }
      ],
      deadLetterExchange: 'twake-tasks.dlx',
      queueArguments: { 'x-single-active-consumer': true },
      maxRetries: Infinity,
      maxRetryDelay: 60_000
    }
  )
  return { close: () => client.close() }
}
