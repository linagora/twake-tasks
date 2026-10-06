import {
  RabbitMQContainer,
  type StartedRabbitMQContainer
} from '@testcontainers/rabbitmq'
import { connect, type Channel, type ChannelModel } from 'amqplib'
import { pino } from 'pino'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi
} from 'vitest'
import type { OutgoingEvent } from '../events/envelope.ts'
import type { Outcome } from '../events/router.ts'
import {
  ACTIVITY_EXCHANGE,
  DEAD_LETTER_QUEUE,
  QUEUE,
  startConsumer,
  startPublisher,
  type Consumer,
  type Delivery
} from './rabbitmq.ts'

let container: StartedRabbitMQContainer
let broker: ChannelModel
let channel: Channel
let consumer: Consumer | undefined

beforeAll(async () => {
  container = await new RabbitMQContainer('rabbitmq:4.1').start()
  broker = await connect(container.getAmqpUrl())
  channel = await broker.createChannel()
}, 120_000)

afterEach(async () => {
  await consumer?.close()
  consumer = undefined
  await channel.purgeQueue(QUEUE)
  await channel.purgeQueue(DEAD_LETTER_QUEUE)
})

afterAll(async () => {
  await broker.close()
  await container.stop()
})

async function consume(
  handle: (delivery: Delivery) => Promise<Outcome>
): Promise<void> {
  consumer = await startConsumer(
    container.getAmqpUrl(),
    pino({ level: 'silent' }),
    handle
  )
}

function publish(
  exchange: string,
  key: string,
  messageId?: string,
  content = Buffer.from(JSON.stringify({ key }))
): void {
  channel.publish(exchange, key, content, {
    persistent: true,
    ...(messageId && { messageId })
  })
}

async function ready(queue: string): Promise<number> {
  return (await channel.checkQueue(queue)).messageCount
}

describe('startConsumer', () => {
  it('hands a space event to the router and acks it once handled', async () => {
    const handle = vi.fn<(d: Delivery) => Promise<Outcome>>()
    handle.mockResolvedValue('processed')
    await consume(handle)

    publish('space', 'twake.space.created', 'm-1')

    await vi.waitFor(() => {
      expect(handle).toHaveBeenCalledWith({
        routingKey: 'twake.space.created',
        messageId: 'm-1',
        body: { key: 'twake.space.created' }
      })
    })
    await consumer?.close()
    consumer = undefined
    expect(await ready(QUEUE)).toBe(0)
  })

  it('receives account deletions from the b2b and auth exchanges only', async () => {
    const handle = vi.fn<(d: Delivery) => Promise<Outcome>>()
    handle.mockResolvedValue('processed')
    await consume(handle)

    publish('b2b', 'domain.user.created', 'm-1')
    publish('b2b', 'domain.user.deleted', 'm-2')
    publish('auth', 'user.deleted', 'm-3')
    publish('b2b', 'domain.organization.deleted', 'm-4')

    await vi.waitFor(() => {
      expect(handle).toHaveBeenCalledTimes(3)
    })
    expect(handle.mock.calls.map(([delivery]) => delivery.routingKey)).toEqual([
      'domain.user.deleted',
      'user.deleted',
      'domain.organization.deleted'
    ])
  })

  it('delivers to one instance at a time, so events stay in order', async () => {
    const first = vi.fn<(d: Delivery) => Promise<Outcome>>()
    first.mockResolvedValue('processed')
    const second = vi.fn<(d: Delivery) => Promise<Outcome>>()
    second.mockResolvedValue('processed')
    await consume(first)
    const other = await startConsumer(
      container.getAmqpUrl(),
      pino({ level: 'silent' }),
      second
    )

    try {
      for (const id of ['m-1', 'm-2', 'm-3', 'm-4']) {
        publish('space', 'twake.space.updated', id)
      }

      await vi.waitFor(() => {
        expect(first).toHaveBeenCalledTimes(4)
      })
      expect(second).not.toHaveBeenCalled()
    } finally {
      await other.close()
    }
  })

  it('dead letters an event the router rejects', async () => {
    await consume(() => Promise.resolve('rejected'))

    publish('space', 'twake.space.deleted', 'm-1')

    await vi.waitFor(async () => {
      expect(await ready(DEAD_LETTER_QUEUE)).toBe(1)
    })
    expect(await ready(QUEUE)).toBe(0)
  })

  it('dead letters a message that is not JSON', async () => {
    const handle = vi.fn<(d: Delivery) => Promise<Outcome>>()
    await consume(handle)

    publish('space', 'twake.space.created', 'm-1', Buffer.from('{'))

    await vi.waitFor(async () => {
      expect(await ready(DEAD_LETTER_QUEUE)).toBe(1)
    })
    expect(handle).not.toHaveBeenCalled()
  })

  it('retries an event whose handling failed until it succeeds', async () => {
    const handle = vi.fn<(d: Delivery) => Promise<Outcome>>()
    handle
      .mockRejectedValueOnce(new Error('db down'))
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue('processed')
    await consume(handle)

    publish('space', 'twake.space.updated', 'm-1')

    await vi.waitFor(
      () => {
        expect(handle).toHaveBeenCalledTimes(3)
      },
      { timeout: 10_000 }
    )
    await consumer?.close()
    consumer = undefined
    expect(await ready(QUEUE)).toBe(0)
    expect(await ready(DEAD_LETTER_QUEUE)).toBe(0)
  })
})

describe('startPublisher', () => {
  const event: OutgoingEvent = {
    specversion: '1.0',
    id: 'evt-1',
    source: 'twake://tasks',
    type: 'com.twake.tasks.task.completed.v1',
    twakeorg: 'org-1',
    data: { object: { id: 'task-1' } }
  }

  it('publishes an event on the activity exchange, routed by its type', async () => {
    const publisher = await startPublisher(
      container.getAmqpUrl(),
      pino({ level: 'silent' })
    )
    await channel.assertExchange(ACTIVITY_EXCHANGE, 'topic', { durable: true })
    const { queue } = await channel.assertQueue('', { exclusive: true })
    await channel.bindQueue(queue, ACTIVITY_EXCHANGE, 'com.twake.tasks.#')

    try {
      await publisher.publish(event)

      const message = await vi.waitFor(async () => {
        const got = await channel.get(queue, { noAck: true })
        if (!got) throw new Error('nothing yet')
        return got
      })
      expect(message.fields.routingKey).toBe(event.type)
      expect(message.properties.messageId).toBe(event.id)
      expect(JSON.parse(message.content.toString())).toEqual(event)
    } finally {
      await publisher.close()
    }
  })

  it('confirms an event no one listens to', async () => {
    const publisher = await startPublisher(
      container.getAmqpUrl(),
      pino({ level: 'silent' })
    )

    try {
      await expect(
        publisher.publish({ ...event, type: 'com.twake.tasks.unheard.v1' })
      ).resolves.toBeUndefined()
    } finally {
      await publisher.close()
    }
  })
})
