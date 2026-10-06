import { randomUUID } from 'node:crypto'
import { DeadLetterError, RabbitMQClient } from '@linagora/rabbitmq-client'
import type { Logger } from 'pino'
import type { OutgoingEvent } from '../events/envelope.ts'
import type { Outcome } from '../events/router.ts'

export interface ConsumerNames {
  spaceExchange: string
  b2bExchange: string
  authExchange: string
  queue: string
  deadLetterExchange: string
}

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
  names: ConsumerNames,
  logger: Logger,
  handle: (delivery: Delivery) => Promise<Outcome>
): Promise<Consumer> {
  const client = new RabbitMQClient({ url, logger, prefetch: 1 })
  await client.init()
  await client.subscribe(
    names.spaceExchange,
    'twake.space.#',
    names.queue,
    async (body, { routingKey, messageId }) => {
      const outcome = await handle({ routingKey, messageId, body })
      if (outcome === 'rejected') {
        throw new DeadLetterError(`${routingKey} rejected`)
      }
    },
    {
      bindings: [
        { exchange: names.b2bExchange, routingKey: 'domain.user.deleted' },
        { exchange: names.authExchange, routingKey: 'user.deleted' },
        {
          exchange: names.b2bExchange,
          routingKey: 'domain.organization.deleted'
        }
      ],
      deadLetterExchange: names.deadLetterExchange,
      queueArguments: { 'x-single-active-consumer': true },
      maxRetries: Infinity,
      maxRetryDelay: 60_000
    }
  )
  return { close: () => client.close() }
}

// With no organizationId, ldap-rest answers with a twake.space.synced for every
// space of every organization.
export async function requestSpaceSync(
  url: string,
  spaceExchange: string,
  logger: Logger
): Promise<void> {
  const client = new RabbitMQClient({ url, logger })
  await client.init()
  try {
    await client.publish(
      spaceExchange,
      'twake.space.sync.requested',
      { timestamp: new Date().toISOString() },
      { messageId: randomUUID() }
    )
  } finally {
    await client.close()
  }
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
  exchange: string,
  logger: Logger
): Promise<Publisher> {
  const client = new RabbitMQClient({ url, logger, publishMaxAttempts: 1 })
  await client.init()
  return {
    async publish(event) {
      await client.publish(
        exchange,
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
