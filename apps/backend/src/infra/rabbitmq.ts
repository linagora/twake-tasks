import { connect, type Channel, type ConsumeMessage } from 'amqplib'
import { setTimeout as delay } from 'node:timers/promises'
import type { Logger } from 'pino'
import type { Outcome } from '../events/router.ts'

export const QUEUE = 'platform.all.twake-tasks'
export const DEAD_LETTER_QUEUE = `${QUEUE}.dlq`
const DEAD_LETTER_EXCHANGE = 'twake-tasks.dlx'
// A message that keeps failing goes to the dead letter queue after this many deliveries.
const DELIVERY_LIMIT = 5
const RETRY_DELAY_MS = 1000

// ldap-rest owns these exchanges. Asserting them with its arguments lets the
// queue bind even when Twake Tasks starts first.
const BINDINGS = [
  { exchange: 'space', pattern: 'twake.space.#' },
  { exchange: 'b2b', pattern: 'domain.user.deleted' },
  { exchange: 'auth', pattern: 'user.deleted' }
] as const

export interface Delivery {
  routingKey: string
  messageId: string | undefined
  content: Buffer
}

export interface Consumer {
  close(): Promise<void>
}

async function declare(channel: Channel): Promise<void> {
  for (const exchange of new Set(BINDINGS.map(binding => binding.exchange))) {
    await channel.assertExchange(exchange, 'topic', { durable: true })
  }
  await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'fanout', {
    durable: true
  })
  await channel.assertQueue(DEAD_LETTER_QUEUE, {
    durable: true,
    arguments: { 'x-queue-type': 'quorum' }
  })
  await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, '')
  await channel.assertQueue(QUEUE, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': DEAD_LETTER_EXCHANGE,
      'x-delivery-limit': DELIVERY_LIMIT
    }
  })
  for (const { exchange, pattern } of BINDINGS) {
    await channel.bindQueue(QUEUE, exchange, pattern)
  }
}

// One message at a time, so the events of a space are handled in the order
// ldap-rest published them.
export async function startConsumer(
  url: string,
  logger: Logger,
  handle: (delivery: Delivery) => Promise<Outcome>,
  onLost: (error: Error) => void = () => undefined
): Promise<Consumer> {
  const connection = await connect(url)
  let closing = false
  connection.on('close', (error?: Error) => {
    if (!closing) onLost(error ?? new Error('RabbitMQ connection closed'))
  })
  connection.on('error', (error: Error) => {
    logger.error({ err: error }, 'RabbitMQ connection failed')
  })
  const channel = await connection.createChannel()
  await declare(channel)
  await channel.prefetch(1)

  async function settle(message: ConsumeMessage): Promise<void> {
    const delivery: Delivery = {
      routingKey: message.fields.routingKey,
      messageId:
        typeof message.properties.messageId === 'string'
          ? message.properties.messageId
          : undefined,
      content: message.content
    }
    try {
      const outcome = await handle(delivery)
      if (outcome === 'rejected') channel.nack(message, false, false)
      else channel.ack(message)
    } catch (error) {
      logger.error(
        { err: error, routingKey: delivery.routingKey },
        'event handling failed, it will be redelivered'
      )
      await delay(RETRY_DELAY_MS)
      channel.nack(message, false, true)
    }
  }

  let current = Promise.resolve()
  const { consumerTag } = await channel.consume(QUEUE, message => {
    if (message) current = settle(message)
  })

  return {
    async close() {
      closing = true
      await channel.cancel(consumerTag)
      await current
      await connection.close()
    }
  }
}
