import { randomUUID } from 'node:crypto'
import { inArray, sql as raw } from 'drizzle-orm'
import { pino } from 'pino'
import { afterAll, describe, expect, inject, it, vi } from 'vitest'
import { createDb } from '../infra/db.ts'
import type { OutgoingEvent } from './envelope.ts'
import { createRelay, enqueue } from './outbox.ts'
import type { PublishedEvent } from './published.ts'
import { outbox, processedEvents } from './schema.ts'

const { sql, db } = createDb(inject('databaseUrl'))
const logger = pino({ level: 'silent' })

afterAll(async () => {
  await sql.end()
})

const anEvent = (): PublishedEvent => ({
  specversion: '1.0',
  id: randomUUID(),
  source: 'twake://tasks',
  type: 'com.twake.tasks.space.provisioned.v1',
  data: {
    space_id: randomUUID(),
    resource: { kind: 'project', id: randomUUID() }
  }
})

// Tests share one outbox, so each looks only at the events it enqueued.
function recorder() {
  const sent: string[] = []
  const publish = vi.fn((event: OutgoingEvent) => {
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
      await enqueue(tx, first)
      await enqueue(tx, second)
    })
    const { sent, publish } = recorder()
    const relay = createRelay({ db, logger, publish })

    await drain(relay)
    await drain(relay)

    expect(sent.filter(id => [first.id, second.id].includes(id))).toEqual([
      first.id,
      second.id
    ])
    expect(publish).toHaveBeenCalledWith(first)
  })

  it('drops the events of a rolled back change', async () => {
    const event = anEvent()
    await db
      .transaction(async tx => {
        await enqueue(tx, event)
        throw new Error('rollback')
      })
      .catch(() => undefined)
    const { sent, publish } = recorder()

    await drain(createRelay({ db, logger, publish }))

    expect(sent).not.toContain(event.id)
  })

  it('keeps an event the broker refused, and sends it on the next run', async () => {
    const event = anEvent()
    await db.transaction(tx => enqueue(tx, event))
    const failing = vi.fn(() => Promise.reject(new Error('broker down')))

    await createRelay({ db, logger, publish: failing }).relayOnce()
    const { sent, publish } = recorder()
    await drain(createRelay({ db, logger, publish }))

    expect(sent).toContain(event.id)
  })

  it('drops an event that breaks its contract, and goes on with the next', async () => {
    const invalid = { ...anEvent(), data: { space_id: 'secret' } }
    const next = anEvent()
    await db.transaction(async tx => {
      await tx.insert(outbox).values({ event: invalid })
      await enqueue(tx, next)
    })
    const watched = logger.child({})
    const error = vi.spyOn(watched, 'error')
    const { sent, publish } = recorder()

    await drain(createRelay({ db, logger: watched, publish }))

    expect(sent).not.toContain(invalid.id)
    expect(sent).toContain(next.id)
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'com.twake.tasks.space.provisioned.v1',
        issues: [{ code: 'invalid_type', path: 'data.resource' }]
      }),
      'relay dropped an invalid event'
    )
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret')
  })
})

describe('processed events', () => {
  const processed = (age: string) => {
    const id = randomUUID()
    return {
      id,
      insert: () =>
        db.insert(processedEvents).values({
          consumer: 'outbox-test',
          source: 'space',
          id,
          processedAt: raw`now() - ${age}::interval`
        })
    }
  }
  const kept = async (...ids: string[]) =>
    (
      await db
        .select({ id: processedEvents.id })
        .from(processedEvents)
        .where(inArray(processedEvents.id, ids))
    ).map(row => row.id)

  it('are forgotten after 30 days, at most once an hour', async () => {
    const [old, recent, later] = [
      processed('31 days'),
      processed('29 days'),
      processed('31 days')
    ]
    await old.insert()
    await recent.insert()
    const relay = createRelay({ db, logger, publish: recorder().publish })

    await relay.relayOnce()
    expect(await kept(old.id, recent.id)).toEqual([recent.id])

    await later.insert()
    await relay.relayOnce()
    expect(await kept(later.id)).toEqual([later.id])
  })
})
