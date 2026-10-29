import { createHash, randomUUID } from 'node:crypto'
import {
  DeadLetterError,
  RabbitMQClient,
  type RabbitMQMessageProperties
} from '@linagora/rabbitmq-client'
import amqplib from 'amqplib'
import type { Logger } from 'pino'
import { isTransient } from './db.ts'
import type { Delivery, OutgoingEvent } from '../events/envelope.ts'
import type { Outcome } from '../events/router.ts'

export interface ConsumerNames {
  spaceExchange: string
  b2bExchange: string
  authExchange: string
  settingsExchange: string
  queue: string
  oldQueue: string
  deadLetterExchange: string
}

export interface Consumer {
  deadLetter(delivery: Delivery, reason: string): Promise<void>
  close(): Promise<void>
}

const SPACE_EVENTS = 'twake.space.#'
// The client binds the dead letter queue with the queue's first routing key.
const DEAD_LETTER_KEY = `${SPACE_EVENTS}.dead`

const MAX_ATTEMPTS = 5

// Common settings sends no message id. A redelivery has the same content, and
// two updates never do, since each carries its own request id and version.
const contentId = (body: unknown) =>
  `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('base64url')}`

const otherBindings = (names: ConsumerNames) => [
  { exchange: names.b2bExchange, routingKey: 'domain.user.deleted' },
  { exchange: names.authExchange, routingKey: 'user.deleted' },
  { exchange: names.b2bExchange, routingKey: 'domain.organization.deleted' },
  { exchange: names.settingsExchange, routingKey: 'user.settings.updated' }
]

/** The messages ready on the queue, or undefined when there is no such queue. */
async function readyMessages(
  url: string,
  queue: string
): Promise<number | undefined> {
  const connection = await amqplib.connect(url)
  try {
    // A missing queue closes the channel it is checked on.
    const probe = await connection.createChannel()
    probe.on('error', () => undefined)
    return await probe.checkQueue(queue).then(
      ok => ok.messageCount,
      () => undefined
    )
  } finally {
    await connection.close()
  }
}

// The client never removes a binding, and declares it again on reconnection.
async function unbindOldQueue(url: string, names: ConsumerNames) {
  const connection = await amqplib.connect(url)
  try {
    const channel = await connection.createChannel()
    const bindings = [
      { exchange: names.spaceExchange, routingKey: SPACE_EVENTS },
      ...otherBindings(names)
    ]
    for (const { exchange, routingKey } of bindings) {
      await channel.unbindQueue(names.oldQueue, exchange, routingKey)
    }
    await channel.unbindQueue(
      `${names.oldQueue}.dlq`,
      names.deadLetterExchange,
      DEAD_LETTER_KEY
    )
  } finally {
    await connection.close()
  }
}

// Every replica consumes the queue, several messages at a time. The events of
// a space are kept in order by its row lock and timestamps, not by the queue.
// An event that keeps failing is dead lettered so the others go on.
// Never replay a space event from there (it could undo newer ones, and the next
// space sync repairs it); an account deletion can be replayed once fixed.
// A transient failure, such as the database being down, retries until it passes.
export async function startConsumer(
  url: string,
  names: ConsumerNames,
  logger: Logger,
  handle: (delivery: Delivery) => Promise<Outcome>,
  options: {
    concurrency?: number
    retryDelayMs?: number
    drainCheckMs?: number
  } = {}
): Promise<Consumer> {
  const unbind = () =>
    unbindOldQueue(url, names).catch((error: unknown) => {
      logger.error({ err: error }, 'unbinding the old queue failed')
    })
  const retryDelay = options.retryDelayMs ?? 1000
  const client = new RabbitMQClient({
    url,
    logger,
    prefetch: options.concurrency ?? 5,
    retryDelay,
    // Only dead letters are published here, and the next pass retries them.
    publishMaxAttempts: 1
  })
  await client.init()
  // The client hands the same properties to every retry of a delivery, so
  // they key its attempts.
  const attempts = new WeakMap<object, number>()
  const consume = async (
    body: Record<string, unknown>,
    properties: RabbitMQMessageProperties
  ) => {
    const { exchange, routingKey, messageId: sentId } = properties
    const messageId =
      sentId ??
      (routingKey === 'user.settings.updated' ? contentId(body) : undefined)
    let outcome: Outcome
    try {
      outcome = await handle({ exchange, routingKey, messageId, body })
    } catch (error) {
      if (isTransient(error)) throw error
      const attempt = (attempts.get(properties) ?? 0) + 1
      attempts.set(properties, attempt)
      if (attempt < MAX_ATTEMPTS) throw error
      logger.error(
        { err: error, routingKey, messageId },
        'event sent to the dead letter queue after repeated failures'
      )
      throw new DeadLetterError(`${routingKey} kept failing`)
    }
    if (outcome === 'rejected') {
      throw new DeadLetterError(`${routingKey} rejected`)
    }
  }
  const subscription = {
    deadLetterExchange: names.deadLetterExchange,
    maxRetries: Infinity,
    maxRetryDelay: 60_000
  }
  await client.subscribe(
    names.spaceExchange,
    SPACE_EVENTS,
    names.queue,
    consume,
    {
      ...subscription,
      bindings: otherBindings(names)
    }
  )
  // The queue of older versions had a single active consumer, which a declared
  // queue cannot drop. It is drained here, one message at a time, and gets
  // nothing new. Older replicas still running bind it again when they
  // reconnect, so it is unbound again then, and once more when found empty.
  let drain: RabbitMQClient | undefined
  let drainCheck: NodeJS.Timeout | undefined
  if ((await readyMessages(url, names.oldQueue)) !== undefined) {
    drain = new RabbitMQClient({
      url,
      logger,
      prefetch: 1,
      retryDelay,
      hooks: { onReconnect: () => void unbind() }
    })
    await drain.init()
    await drain.subscribe(
      names.spaceExchange,
      SPACE_EVENTS,
      names.oldQueue,
      consume,
      { ...subscription, queueArguments: { 'x-single-active-consumer': true } }
    )
    await unbindOldQueue(url, names)
    const checkEvery = options.drainCheckMs ?? 60_000
    const check = () => {
      drainCheck = setTimeout(() => {
        readyMessages(url, names.oldQueue)
          .then(async ready => {
            if (ready) {
              check()
              return
            }
            await unbind()
            logger.info({ queue: names.oldQueue }, 'old queue drained')
          })
          .catch((error: unknown) => {
            logger.error({ err: error }, 'checking the old queue failed')
            check()
          })
      }, checkEvery)
    }
    check()
  }
  return {
    // An unroutable publish fails, so the caller keeps the event.
    deadLetter: (delivery, reason) =>
      client.publish(
        names.deadLetterExchange,
        DEAD_LETTER_KEY,
        delivery.body as Record<string, unknown>,
        {
          ...(delivery.messageId !== undefined && {
            messageId: delivery.messageId
          }),
          mandatory: true,
          headers: {
            'x-twake-tasks-exchange': delivery.exchange,
            'x-twake-tasks-routing-key': delivery.routingKey,
            'x-twake-tasks-reason': reason
          }
        }
      ),
    async close() {
      clearTimeout(drainCheck)
      await drain?.close()
      await client.close()
    }
  }
}

// With no organizationId, ldap-rest answers with a twake.space.synced for every
// space of every organization.
export async function requestSpaceSync(
  url: string,
  spaceExchange: string,
  logger: Logger
): Promise<void> {
  const client = new RabbitMQClient({ url, logger, publishMaxAttempts: 1 })
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

export async function connectLive(
  url: string,
  logger: Logger
): Promise<RabbitMQClient> {
  // The client logs every publish and delivery at info.
  const client = new RabbitMQClient({
    url,
    logger: logger.child({ component: 'live' }, { level: 'warn' })
  })
  await client.init()
  return client
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
