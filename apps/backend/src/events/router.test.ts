import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import type { Tx } from '../infra/db.ts'
import type { Delivery } from '../infra/rabbitmq.ts'
import type { Deduplicator, EventKey } from './dedupe.ts'
import type { PlatformEvent } from './envelope.ts'
import {
  createMessageHandler,
  MalformedEventError,
  NotYetKnownError,
  RejectedEventError,
  type Handler,
  type Park
} from './router.ts'

const tx = {} as Tx

function memoryDeduplicator(): Deduplicator & { keys: EventKey[] } {
  const seen = new Set<string>()
  const keys: EventKey[] = []
  return {
    keys,
    async once(key, process) {
      const id = `${key.source}|${key.id}`
      if (seen.has(id)) return false
      await process(tx)
      seen.add(id)
      keys.push(key)
      return true
    }
  }
}

function setup() {
  const handler = vi.fn<Handler<PlatformEvent>>().mockResolvedValue()
  const dedupe = memoryDeduplicator()
  const park = vi.fn<Park>().mockResolvedValue()
  const handle = createMessageHandler({
    routes: new Map([['twake.space.created', handler]]),
    dedupe,
    park,
    logger: pino({ level: 'silent' })
  })
  return { handle, handler, dedupe, park }
}

const delivery = (overrides: Partial<Delivery> = {}): Delivery => ({
  exchange: 'space',
  routingKey: 'twake.space.created',
  messageId: 'm-1',
  body: { id: 's1' },
  ...overrides
})

describe('createMessageHandler', () => {
  it('routes an event by routing key and dedupes on its message id', async () => {
    const { handle, handler, dedupe } = setup()

    expect(await handle(delivery())).toBe('processed')
    expect(handler).toHaveBeenCalledWith(
      {
        routingKey: 'twake.space.created',
        messageId: 'm-1',
        body: { id: 's1' }
      },
      tx,
      expect.anything()
    )
    expect(dedupe.keys).toEqual([{ source: 'amqp', id: 'm-1' }])
  })

  it('skips a redelivered event', async () => {
    const { handle, handler } = setup()

    await handle(delivery())
    expect(await handle(delivery())).toBe('duplicate')
    expect(handler).toHaveBeenCalledOnce()
  })

  it('ignores a routing key without handler', async () => {
    const { handle, handler } = setup()

    expect(await handle(delivery({ routingKey: 'twake.space.archived' }))).toBe(
      'unrouted'
    )
    expect(handler).not.toHaveBeenCalled()
  })

  it('drops an event without a message id', async () => {
    const { handle, handler } = setup()

    expect(await handle(delivery({ messageId: undefined }))).toBe('malformed')
    expect(handler).not.toHaveBeenCalled()
  })

  it('drops an event its handler finds malformed', async () => {
    const { handle, handler, dedupe } = setup()
    handler.mockRejectedValueOnce(new MalformedEventError('no space id'))

    expect(await handle(delivery())).toBe('malformed')
    expect(dedupe.keys).toEqual([])
  })

  it('rejects an event its handler rejects, without marking it processed', async () => {
    const { handle, handler, dedupe } = setup()
    handler.mockRejectedValueOnce(new RejectedEventError('unknown space'))

    expect(await handle(delivery())).toBe('rejected')
    expect(dedupe.keys).toEqual([])
  })

  it('parks an event about a space not known yet, without marking it processed', async () => {
    const { handle, handler, dedupe, park } = setup()
    handler.mockRejectedValueOnce(new NotYetKnownError('s1'))

    expect(await handle(delivery())).toBe('parked')
    expect(park).toHaveBeenCalledWith(
      delivery(),
      's1',
      'space s1 not known yet'
    )
    expect(dedupe.keys).toEqual([])
  })

  it('propagates a handler failure so the event is redelivered', async () => {
    const { handle, handler } = setup()
    handler.mockRejectedValueOnce(new Error('db down'))

    await expect(handle(delivery())).rejects.toThrow('db down')
    expect(await handle(delivery())).toBe('processed')
  })
})
