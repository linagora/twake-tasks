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
import type { Outcome } from '../events/router.ts'
import {
  DEAD_LETTER_QUEUE,
  QUEUE,
  startConsumer,
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

function publish(exchange: string, key: string, messageId?: string): void {
  channel.publish(exchange, key, Buffer.from(JSON.stringify({ key })), {
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
        content: Buffer.from(JSON.stringify({ key: 'twake.space.created' }))
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

    await vi.waitFor(() => {
      expect(handle).toHaveBeenCalledTimes(2)
    })
    expect(handle.mock.calls.map(([delivery]) => delivery.routingKey)).toEqual([
      'domain.user.deleted',
      'user.deleted'
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

  it('redelivers an event whose handling failed', async () => {
    const handle = vi.fn<(d: Delivery) => Promise<Outcome>>()
    handle
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue('processed')
    await consume(handle)

    publish('space', 'twake.space.updated', 'm-1')

    await vi.waitFor(
      () => {
        expect(handle).toHaveBeenCalledTimes(2)
      },
      { timeout: 5000 }
    )
    expect(await ready(DEAD_LETTER_QUEUE)).toBe(0)
  })
})
