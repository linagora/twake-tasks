import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import type { Tx } from '../infra/db.ts'
import type { Deduplicator, EventKey } from './dedupe.ts'
import type { CloudEvent, PlatformEvent } from './envelope.ts'
import { createMessageHandler, type Handler } from './router.ts'

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
  const activity = vi.fn<Handler<CloudEvent>>().mockResolvedValue()
  const platform = vi.fn<Handler<PlatformEvent>>().mockResolvedValue()
  const dedupe = memoryDeduplicator()
  const handle = createMessageHandler({
    routes: {
      activity: new Map([['com.twake.drive.file.created.v1', activity]]),
      platform: new Map([['b2b.group.created', platform]])
    },
    dedupe,
    logger: pino({ level: 'silent' })
  })
  return { handle, activity, platform, dedupe }
}

const fileCreated = {
  specversion: '1.0',
  id: 'evt-1',
  source: 'twake://drive',
  type: 'com.twake.drive.file.created.v1',
  twakeorg: 'linagora',
  twakeactor: 'user1@linagora.com',
  data: {
    object: { type: 'file', id: 'f1' }
  }
}

const message = (value: unknown, headers?: Record<string, unknown>) => ({
  value: Buffer.from(JSON.stringify(value)),
  offset: '0',
  ...(headers && { headers })
})

describe('createMessageHandler', () => {
  it('routes an activity event by type and dedupes on source and id', async () => {
    const { handle, activity, dedupe } = setup()

    expect(await handle('twake.drive.events.v1', message(fileCreated))).toBe(
      'processed'
    )
    expect(activity).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'evt-1' }),
      tx
    )
    expect(dedupe.keys).toEqual([{ source: 'twake://drive', id: 'evt-1' }])
  })

  it('skips a redelivered event', async () => {
    const { handle, activity } = setup()

    await handle('twake.drive.events.v1', message(fileCreated))
    expect(await handle('twake.drive.events.v1', message(fileCreated))).toBe(
      'duplicate'
    )
    expect(activity).toHaveBeenCalledOnce()
  })

  it('ignores a type without handler', async () => {
    const { handle, activity } = setup()
    const event = { ...fileCreated, type: 'com.twake.drive.file.moved.v1' }

    expect(await handle('twake.drive.events.v1', message(event))).toBe(
      'unrouted'
    )
    expect(activity).not.toHaveBeenCalled()
  })

  it('drops a malformed event without calling any handler', async () => {
    const { handle, activity } = setup()

    expect(
      await handle('twake.drive.events.v1', message({ hello: 'world' }))
    ).toBe('malformed')
    expect(activity).not.toHaveBeenCalled()
  })

  it('routes a platform event by AMQP routing key and dedupes on message id', async () => {
    const { handle, platform, activity, dedupe } = setup()
    const headers = {
      amqp_routing_key: Buffer.from('b2b.group.created'),
      amqp_message_id: Buffer.from('m-1')
    }

    expect(
      await handle(
        'twake.platform.events.v1',
        message({ groupId: 'g1' }, headers)
      )
    ).toBe('processed')
    expect(platform).toHaveBeenCalledWith(
      {
        routingKey: 'b2b.group.created',
        messageId: 'm-1',
        body: { groupId: 'g1' }
      },
      tx
    )
    expect(activity).not.toHaveBeenCalled()
    expect(dedupe.keys).toEqual([{ source: 'amqp', id: 'm-1' }])
  })

  it('propagates a handler failure so the offset is not committed', async () => {
    const { handle, activity } = setup()
    activity.mockRejectedValueOnce(new Error('db down'))

    await expect(
      handle('twake.drive.events.v1', message(fileCreated))
    ).rejects.toThrow('db down')
    expect(await handle('twake.drive.events.v1', message(fileCreated))).toBe(
      'processed'
    )
  })
})
