import { randomUUID } from 'node:crypto'
import { pino } from 'pino'
import { afterAll, describe, expect, inject, it, vi } from 'vitest'
import { createDb } from '../infra/db.ts'
import type { OutgoingEvent } from './envelope.ts'
import { createRelay, enqueue } from './outbox.ts'

const { sql, db } = createDb(inject('databaseUrl'))
const logger = pino({ level: 'silent' })

afterAll(async () => {
  await sql.end()
})

const anEvent = (): OutgoingEvent => ({
  specversion: '1.0',
  id: randomUUID(),
  source: 'twake://tasks',
  type: 'com.twake.tasks.task.created.v1',
  data: {}
})

// Tests share one outbox, so each looks only at the events it enqueued.
function recorder() {
  const sent: string[] = []
  const publish = vi.fn((_key: string, event: OutgoingEvent) => {
    sent.push(event.id)
    return Promise.resolve()
  })
  return { sent, publish }
}

// Other tests write task events too, so the outbox can hold several batches.
async function drain(relay: ReturnType<typeof createRelay>) {
  while ((await relay.relayOnce()) > 0);
}

describe('outbox', () => {
  it('publishes committed events in order, once', async () => {
    const [first, second] = [anEvent(), anEvent()]
    await db.transaction(async tx => {
      await enqueue(tx, 'board-1', first)
      await enqueue(tx, 'board-1', second)
    })
    const { sent, publish } = recorder()
    const relay = createRelay({ db, logger, publish })

    await drain(relay)
    await drain(relay)

    expect(sent.filter(id => [first.id, second.id].includes(id))).toEqual([
      first.id,
      second.id
    ])
    expect(publish).toHaveBeenCalledWith('board-1', first)
  })

  it('drops the events of a rolled back change', async () => {
    const event = anEvent()
    await db
      .transaction(async tx => {
        await enqueue(tx, 'board-1', event)
        throw new Error('rollback')
      })
      .catch(() => undefined)
    const { sent, publish } = recorder()

    await drain(createRelay({ db, logger, publish }))

    expect(sent).not.toContain(event.id)
  })

  it('keeps an event Kafka refused, and sends it on the next run', async () => {
    const event = anEvent()
    await db.transaction(tx => enqueue(tx, 'board-1', event))
    const failing = vi.fn(() => Promise.reject(new Error('kafka down')))

    await createRelay({ db, logger, publish: failing }).relayOnce()
    const { sent, publish } = recorder()
    await drain(createRelay({ db, logger, publish }))

    expect(sent).toContain(event.id)
  })
})
