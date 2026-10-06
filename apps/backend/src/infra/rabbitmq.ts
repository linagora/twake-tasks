import { DeadLetterError, RabbitMQClient } from '@linagora/rabbitmq-client'
import type { Logger } from 'pino'
import type { OutgoingEvent } from '../events/envelope.ts'
import type { Outcome } from '../events/router.ts'

export const ACTIVITY_EXCHANGE = 'activity'
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
        { exchange: 'auth', routingKey: 'user.deleted' },
        { exchange: 'b2b', routingKey: 'domain.organization.deleted' }
      ],
      deadLetterExchange: 'twake-tasks.dlx',
      queueArguments: { 'x-single-active-consumer': true },
      maxRetries: Infinity,
      maxRetryDelay: 60_000
    }
  )
  return { close: () => client.close() }
}

export interface Publisher {
  publish(event: OutgoingEvent): Promise<void>
  close(): Promise<void>
}

// One attempt per call: the outbox relay retries on its next run, and a
// backoff here would hold its transaction open. Not mandatory, since Tasks
// runs with no subscriber on the activity exchange when it is standalone.
export async function startPublisher(
  url: string,
  logger: Logger
): Promise<Publisher> {
  const client = new RabbitMQClient({ url, logger, publishMaxAttempts: 1 })
  await client.init()
  return {
    async publish(event) {
      await client.publish(
        ACTIVITY_EXCHANGE,
        event.type,
        { ...event },
        {
          messageId: event.id
        }
      )
    },
    close: () => client.close()
  }
}
