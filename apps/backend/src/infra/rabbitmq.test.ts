import {
  RabbitMQContainer,
  type StartedRabbitMQContainer
} from '@testcontainers/rabbitmq'
import { connect, type Channel, type ChannelModel } from 'amqplib'
import type { AddressInfo, Socket } from 'node:net'
import { connect as netConnect, createServer } from 'node:net'
import { pino } from 'pino'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  inject,
  it,
  vi
} from 'vitest'
import type { Delivery, OutgoingEvent } from '../events/envelope.ts'
import type { Outcome } from '../events/router.ts'
import {
  listenForBoardChanges,
  tellBoardChanged
} from '../modules/live/index.ts'
import { createChanges } from './changes.ts'
import { createDb } from './db.ts'
import {
  connectLive,
  requestSpaceSync,
  startConsumer,
  startPublisher,
  type Consumer,
  type ConsumerNames
} from './rabbitmq.ts'

const names: ConsumerNames = {
  spaceExchange: 'space',
  b2bExchange: 'b2b',
  authExchange: 'auth',
  settingsExchange: 'settings',
  queue: 'twake-tasks',
  oldQueue: 'platform.all.twake-tasks',
  deadLetterExchange: 'twake-tasks.dlx'
}
const QUEUE = names.queue
const DEAD_LETTER_QUEUE = `${QUEUE}.dlq`
const OLD_QUEUE = names.oldQueue
const OLD_DEAD_LETTER_QUEUE = `${OLD_QUEUE}.dlq`
const ACTIVITY_EXCHANGE = 'activity'

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
  handle: (delivery: Delivery) => Promise<Outcome>,
  under = names
): Promise<void> {
  consumer = await startConsumer(
    container.getAmqpUrl(),
    under,
    pino({ level: 'silent' }),
    handle,
    { retryDelayMs: 10 }
  )
}

const unreachable = () =>
  Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })

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

// As a load balancer in front of a node that hangs: the connections it holds
// stay open and go silent, and a new one reaches a node that answers.
async function hangingNode() {
  const target = new URL(container.getAmqpUrl())
  const open = new Set<Socket>()
  const hung = new Set<Socket>()
  const server = createServer(client => {
    const upstream = netConnect(Number(target.port), target.hostname)
    client.pipe(upstream).pipe(client)
    for (const socket of [client, upstream]) {
      open.add(socket)
      socket.on('error', () => undefined)
      socket.on('close', () => open.delete(socket))
    }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const url = new URL(container.getAmqpUrl())
  url.hostname = '127.0.0.1'
  url.port = String(port)
  return {
    url: url.toString(),
    hang() {
      for (const socket of open) {
        socket.unpipe()
        socket.pause()
        hung.add(socket)
      }
    },
    // As the heartbeat would, so that the clients can close.
    endHung() {
      for (const socket of hung) socket.destroy()
    },
    close: () => new Promise(resolve => server.close(resolve))
  }
}

async function nextMessage(queue: string) {
  return vi.waitFor(async () => {
    const got = await channel.get(queue, { noAck: true })
    if (!got) throw new Error('nothing yet')
    return got
  }, 5000)
}

describe('startConsumer', () => {
  it('hands a space event to the router and acks it once handled', async () => {
    const handle = vi.fn<(d: Delivery) => Promise<Outcome>>()
    handle.mockResolvedValue('processed')
    await consume(handle)

    publish('space', 'twake.space.created', 'm-1')

    await vi.waitFor(() => {
      expect(handle).toHaveBeenCalledWith({
        exchange: 'space',
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

  it('receives settings updates, and not the requests to change them', async () => {
    const handle = vi.fn<(d: Delivery) => Promise<Outcome>>()
    handle.mockResolvedValue('processed')
    await consume(handle)

    publish('settings', 'user.settings.update', 'm-1')
    publish('settings', 'user.settings.updated', 'm-2')

    await vi.waitFor(() => {
      expect(handle).toHaveBeenCalledTimes(1)
    })
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ routingKey: 'user.settings.updated' })
    )
  })

  it('names a settings update sent without an id by its content', async () => {
    const handle = vi.fn<(d: Delivery) => Promise<Outcome>>()
    handle.mockResolvedValue('processed')
    await consume(handle)

    publish('settings', 'user.settings.updated')
    publish('settings', 'user.settings.updated')
    publish('space', 'twake.space.updated')

    await vi.waitFor(() => {
      expect(handle).toHaveBeenCalledTimes(3)
    })
    const [first, second, space] = handle.mock.calls.map(([d]) => d.messageId)
    expect(first).toMatch(/^sha256:/)
    expect(second).toBe(first)
    expect(space).toBeUndefined()
  })

  it('hands messages to every instance, several at a time', async () => {
    let release = () => {}
    const released = new Promise<void>(resolve => (release = resolve))
    const held = () => released.then((): Outcome => 'processed')
    const first = vi.fn<(d: Delivery) => Promise<Outcome>>(held)
    const second = vi.fn<(d: Delivery) => Promise<Outcome>>(held)
    await consume(first)
    const other = await startConsumer(
      container.getAmqpUrl(),
      names,
      pino({ level: 'silent' }),
      second
    )

    try {
      for (const id of ['m-1', 'm-2', 'm-3', 'm-4']) {
        publish('space', 'twake.space.updated', id)
      }

      await vi.waitFor(() => {
        expect(first.mock.calls.length + second.mock.calls.length).toBe(4)
      })
      expect(first).toHaveBeenCalled()
      expect(second).toHaveBeenCalled()
    } finally {
      release()
      await other.close()
    }
  })

  it('counts the attempts of each failing message apart', async () => {
    const handle = vi.fn<(d: Delivery) => Promise<Outcome>>()
    handle.mockRejectedValue(new Error('bug'))
    await consume(handle)

    publish('space', 'twake.space.updated', 'm-1')
    publish('space', 'twake.space.updated', 'm-2')

    await vi.waitFor(async () => {
      expect(await ready(DEAD_LETTER_QUEUE)).toBe(2)
    })
    for (const id of ['m-1', 'm-2']) {
      expect(
        handle.mock.calls.filter(([delivery]) => delivery.messageId === id)
      ).toHaveLength(5)
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

  it('dead letters a parked event with where it came from and why', async () => {
    await consume(() => Promise.resolve('processed'))

    await consumer?.deadLetter(
      {
        exchange: 'space',
        routingKey: 'twake.space.member.added',
        messageId: 'm-1',
        body: { id: 's1' }
      },
      'space s1 not known yet'
    )

    const message = await vi.waitFor(async () => {
      const got = await channel.get(DEAD_LETTER_QUEUE, { noAck: true })
      if (!got) throw new Error('nothing yet')
      return got
    })
    expect(message.properties.messageId).toBe('m-1')
    expect(message.properties.headers).toMatchObject({
      'x-twake-tasks-exchange': 'space',
      'x-twake-tasks-routing-key': 'twake.space.member.added',
      'x-twake-tasks-reason': 'space s1 not known yet'
    })
    expect(JSON.parse(message.content.toString())).toEqual({ id: 's1' })
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

  it('dead letters an event that keeps failing, without holding up the next', async () => {
    const handle = vi.fn<(d: Delivery) => Promise<Outcome>>()
    handle.mockImplementation(delivery =>
      delivery.messageId === 'm-1'
        ? Promise.reject(new Error('bug'))
        : Promise.resolve('processed')
    )
    await consume(handle)

    publish('space', 'twake.space.updated', 'm-1')
    publish('space', 'twake.space.updated', 'm-2')

    await vi.waitFor(async () => {
      expect(await ready(DEAD_LETTER_QUEUE)).toBe(1)
    })
    expect(
      handle.mock.calls.map(([delivery]) => delivery.messageId).sort()
    ).toEqual(['m-1', 'm-1', 'm-1', 'm-1', 'm-1', 'm-2'])
  })

  it('keeps retrying while the database is unreachable', async () => {
    const handle = vi.fn<(d: Delivery) => Promise<Outcome>>()
    for (let i = 0; i < 8; i++) handle.mockRejectedValueOnce(unreachable())
    handle.mockResolvedValue('processed')
    await consume(handle)

    publish('space', 'twake.space.updated', 'm-1')

    await vi.waitFor(
      () => {
        expect(handle).toHaveBeenCalledTimes(9)
      },
      { timeout: 10_000 }
    )
    await consumer?.close()
    consumer = undefined
    expect(await ready(QUEUE)).toBe(0)
    expect(await ready(DEAD_LETTER_QUEUE)).toBe(0)
  }, 15_000)

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
  }, 15_000)

  // As versions with a single active consumer declared it.
  async function declareOldQueue() {
    for (const exchange of [
      'space',
      'b2b',
      'auth',
      'settings',
      'twake-tasks.dlx'
    ]) {
      await channel.assertExchange(exchange, 'topic', { durable: true })
    }
    await channel.assertQueue(OLD_DEAD_LETTER_QUEUE, { durable: true })
    await channel.bindQueue(
      OLD_DEAD_LETTER_QUEUE,
      'twake-tasks.dlx',
      'twake.space.#.dead'
    )
    await channel.assertQueue(OLD_QUEUE, {
      durable: true,
      deadLetterExchange: 'twake-tasks.dlx',
      deadLetterRoutingKey: 'twake.space.#.dead',
      arguments: {
        'x-queue-type': 'quorum',
        'x-overflow': 'reject-publish',
        'x-dead-letter-strategy': 'at-least-once',
        'x-single-active-consumer': true
      }
    })
    await channel.bindQueue(OLD_QUEUE, 'space', 'twake.space.#')
    await channel.bindQueue(OLD_QUEUE, 'b2b', 'domain.user.deleted')
  }

  it('unbinds the queue of older versions again once it finds it empty', async () => {
    await declareOldQueue()
    channel.sendToQueue(OLD_QUEUE, Buffer.from('{}'), { messageId: 'm-old' })
    const handle = vi.fn<(d: Delivery) => Promise<Outcome>>()
    handle.mockResolvedValue('processed')

    try {
      consumer = await startConsumer(
        container.getAmqpUrl(),
        names,
        pino({ level: 'silent' }),
        handle,
        { retryDelayMs: 10, drainCheckMs: 500 }
      )
      await vi.waitFor(() => {
        expect(handle).toHaveBeenCalledWith(
          expect.objectContaining({ messageId: 'm-old' })
        )
      })
      // An older replica reconnecting.
      await channel.bindQueue(OLD_QUEUE, 'space', 'twake.space.#')
      await new Promise(resolve => setTimeout(resolve, 1500))

      publish('space', 'twake.space.updated', 'm-1')

      await vi.waitFor(() => {
        expect(handle).toHaveBeenCalledWith(
          expect.objectContaining({ messageId: 'm-1' })
        )
      })
      await new Promise(resolve => setTimeout(resolve, 300))
      expect(
        handle.mock.calls.filter(([d]) => d.messageId === 'm-1')
      ).toHaveLength(1)
    } finally {
      await consumer?.close()
      consumer = undefined
      await channel.deleteQueue(OLD_QUEUE)
      await channel.deleteQueue(OLD_DEAD_LETTER_QUEUE)
    }
  })

  it('drains the queue of older versions, which then gets nothing new', async () => {
    await declareOldQueue()
    channel.sendToQueue(OLD_QUEUE, Buffer.from('{}'), { messageId: 'm-old' })
    const handle = vi.fn<(d: Delivery) => Promise<Outcome>>()
    handle.mockResolvedValue('processed')

    try {
      await consume(handle)
      await vi.waitFor(() => {
        expect(handle).toHaveBeenCalledWith(
          expect.objectContaining({ messageId: 'm-old' })
        )
      })
      await consumer?.close()
      consumer = undefined

      publish('space', 'twake.space.updated', 'm-1')
      publish('b2b', 'domain.user.deleted', 'm-2')
      channel.publish(
        'twake-tasks.dlx',
        'twake.space.#.dead',
        Buffer.from('{}')
      )

      await vi.waitFor(async () => {
        expect(await ready(QUEUE)).toBe(2)
        expect(await ready(DEAD_LETTER_QUEUE)).toBe(1)
      })
      expect(await ready(OLD_QUEUE)).toBe(0)
      expect(await ready(OLD_DEAD_LETTER_QUEUE)).toBe(0)
    } finally {
      await channel.deleteQueue(OLD_QUEUE)
      await channel.deleteQueue(OLD_DEAD_LETTER_QUEUE)
    }
  })

  it('follows the exchange and queue names it is given', async () => {
    const renamed: ConsumerNames = {
      spaceExchange: 'staging.space',
      b2bExchange: 'staging.b2b',
      authExchange: 'staging.auth',
      settingsExchange: 'staging.settings',
      queue: 'staging.twake-tasks',
      oldQueue: 'staging.platform.all.twake-tasks',
      deadLetterExchange: 'staging.twake-tasks.dlx'
    }
    const handle = vi.fn<(d: Delivery) => Promise<Outcome>>()
    handle.mockResolvedValue('rejected')
    await consume(handle, renamed)

    publish('space', 'twake.space.created', 'm-1')
    publish('staging.space', 'twake.space.created', 'm-2')
    publish('staging.b2b', 'domain.user.deleted', 'm-3')
    publish('staging.auth', 'user.deleted', 'm-4')
    publish('staging.settings', 'user.settings.updated', 'm-5')

    await vi.waitFor(async () => {
      expect(await ready('staging.twake-tasks.dlq')).toBe(4)
    })
    expect(handle.mock.calls.map(([delivery]) => delivery.messageId)).toEqual([
      'm-2',
      'm-3',
      'm-4',
      'm-5'
    ])
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

  it.each([ACTIVITY_EXCHANGE, 'staging.activity'])(
    'publishes an event on the %s exchange, routed by its type',
    async exchange => {
      const publisher = await startPublisher(
        container.getAmqpUrl(),
        exchange,
        pino({ level: 'silent' })
      )
      await channel.assertExchange(exchange, 'topic', { durable: true })
      const { queue } = await channel.assertQueue('', { exclusive: true })
      await channel.bindQueue(queue, exchange, 'com.twake.tasks.#')

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
    }
  )

  it('gives up on a hung node, then publishes on a new connection', async () => {
    const node = await hangingNode()
    const publisher = await startPublisher(
      node.url,
      ACTIVITY_EXCHANGE,
      pino({ level: 'silent' }),
      { timeoutMs: 500 }
    )
    await channel.assertExchange(ACTIVITY_EXCHANGE, 'topic', { durable: true })
    const { queue } = await channel.assertQueue('', { exclusive: true })
    await channel.bindQueue(queue, ACTIVITY_EXCHANGE, 'com.twake.tasks.#')

    try {
      node.hang()
      await expect(publisher.publish(event)).rejects.toThrow()
      await publisher.publish({ ...event, id: 'evt-2' })

      const message = await nextMessage(queue)
      expect(message.properties.messageId).toBe('evt-2')
    } finally {
      node.endHung()
      await publisher.close()
      await node.close()
    }
  }, 15_000)

  it('leaves no connection open once closed during a publish', async () => {
    const node = await hangingNode()
    const publisher = await startPublisher(
      node.url,
      ACTIVITY_EXCHANGE,
      pino({ level: 'silent' }),
      { timeoutMs: 5000 }
    )

    const failed = expect(publisher.publish(event)).rejects.toThrow()
    await publisher.close()
    await failed

    await expect(
      Promise.race([
        node.close().then(() => 'closed'),
        new Promise(resolve => setTimeout(resolve, 2000, 'still open'))
      ])
    ).resolves.toBe('closed')
  })

  it('confirms an event no one listens to', async () => {
    const publisher = await startPublisher(
      container.getAmqpUrl(),
      ACTIVITY_EXCHANGE,
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

describe('live board changes', () => {
  it('reach the streams of every replica once committed', async () => {
    const { sql, db } = createDb(inject('databaseUrl'))
    const log = pino({ level: 'silent' })
    const replicas = [
      await connectLive(container.getAmqpUrl(), log),
      await connectLive(container.getAmqpUrl(), log)
    ]
    const boardId = '0199d0a4-5c3e-7b1a-9f2d-3e4f5a6b7c8d'
    const heard = replicas.map(() => vi.fn<(version: number) => void>())

    try {
      for (const [index, replica] of replicas.entries()) {
        const changes = createChanges()
        changes.subscribe(boardId, version => heard[index]?.(version))
        await listenForBoardChanges(replica, 'live', changes, log)
      }
      await db.transaction(tx => {
        tellBoardChanged(tx, { id: boardId, version: 7 })
        return Promise.resolve()
      })

      for (const listener of heard) {
        await vi.waitFor(() => {
          expect(listener).toHaveBeenCalledWith(7)
        })
      }
    } finally {
      for (const replica of replicas) await replica.close()
      await sql.end()
    }
  })

  it('reach the other replicas again once the node of a publisher hangs', async () => {
    const { sql, db } = createDb(inject('databaseUrl'))
    const log = pino({ level: 'silent' })
    const node = await hangingNode()
    const publisher = await connectLive(node.url, log, { timeoutMs: 500 })
    const listener = await connectLive(container.getAmqpUrl(), log)
    const boardId = '0199d0a4-5c3e-7b1a-9f2d-3e4f5a6b7c8d'
    const heard = vi.fn<(version: number) => void>()
    const tell = (version: number) =>
      db.transaction(tx => {
        tellBoardChanged(tx, { id: boardId, version })
        return Promise.resolve()
      })

    try {
      const changes = createChanges()
      changes.subscribe(boardId, version => {
        heard(version)
      })
      await listenForBoardChanges(listener, 'live', changes, log)
      const warn = vi.fn()
      await listenForBoardChanges(publisher, 'live', createChanges(), { warn })

      node.hang()
      await tell(7)
      await vi.waitFor(() => {
        expect(warn).toHaveBeenCalled()
      }, 5000)
      await tell(8)

      await vi.waitFor(() => {
        expect(heard).toHaveBeenCalledWith(8)
      }, 5000)
    } finally {
      node.endHung()
      await publisher.close()
      await listener.close()
      await node.close()
      await sql.end()
    }
  }, 20_000)

  it('still publishes after a publish failed', async () => {
    const { sql, db } = createDb(inject('databaseUrl'))
    const boardId = '0199d0a4-5c3e-7b1a-9f2d-3e4f5a6b7c8d'
    // As the client: a failed publish marks it disconnected, and only the
    // next publish reconnects it.
    let connected = true
    const publish = vi.fn(() => {
      if (publish.mock.calls.length > 1) return Promise.resolve()
      connected = false
      return Promise.reject(new Error('channel closed'))
    })
    const broker = {
      isConnected: () => connected,
      subscribe: () => Promise.resolve(),
      publish
    }
    const tell = () =>
      db.transaction(tx => {
        tellBoardChanged(tx, { id: boardId, version: 7 })
        return Promise.resolve()
      })

    try {
      await listenForBoardChanges(
        broker,
        'live',
        createChanges(),
        pino({ level: 'silent' })
      )
      await tell()
      await tell()

      expect(publish).toHaveBeenCalledTimes(2)
    } finally {
      await sql.end()
    }
  })
})

describe('requestSpaceSync', () => {
  it('asks for a sync of every organization on the space exchange', async () => {
    await channel.assertExchange('space', 'topic', { durable: true })
    const { queue } = await channel.assertQueue('', { exclusive: true })
    await channel.bindQueue(queue, 'space', 'twake.space.sync.requested')

    await requestSpaceSync(
      container.getAmqpUrl(),
      'space',
      pino({ level: 'silent' })
    )

    const message = await vi.waitFor(async () => {
      const got = await channel.get(queue, { noAck: true })
      if (!got) throw new Error('nothing yet')
      return got
    })
    expect(message.properties.messageId).toEqual(expect.any(String))
    const body = JSON.parse(message.content.toString()) as object
    expect(body).toEqual({ timestamp: expect.any(String) as string })
  })
})
