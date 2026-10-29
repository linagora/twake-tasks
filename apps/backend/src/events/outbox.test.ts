import { randomUUID } from 'node:crypto'
import { sql as raw } from 'drizzle-orm'
import { pino } from 'pino'
import { afterAll, describe, expect, inject, it, vi } from 'vitest'
import { createDb } from '../infra/db.ts'
import { createMetrics } from '../infra/metrics.ts'
import type { OutgoingEvent } from './envelope.ts'
import { createRelay, enqueue, measureOutbox } from './outbox.ts'
import type { PublishedEvent } from './published.ts'
import { outbox } from './schema.ts'

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

  it('logs a failed publish with the request that caused it', async () => {
    const event = { ...anEvent(), twakecorrelationid: randomUUID() }
    await db.transaction(tx => enqueue(tx, event))
    const watched = logger.child({})
    const warn = vi.spyOn(watched, 'warn')
    const failing = (sent: OutgoingEvent) =>
      sent.id === event.id
        ? Promise.reject(new Error('broker down'))
        : Promise.resolve()

    await drain(createRelay({ db, logger: watched, publish: failing }))
    await drain(createRelay({ db, logger, publish: recorder().publish }))

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ reqId: event.twakecorrelationid }),
      'relay failed'
    )
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

  it('relays a type or a value added by a newer release', async () => {
    const newType = { ...anEvent(), type: 'com.twake.tasks.space.archived.v1' }
    const event = anEvent()
    const newValue = {
      ...event,
      data: { ...event.data, resource: { kind: 'space', id: randomUUID() } }
    }
    await db.transaction(async tx => {
      await tx.insert(outbox).values({ event: newType })
      await tx.insert(outbox).values({ event: newValue })
    })
    const { sent, publish } = recorder()

    await drain(createRelay({ db, logger, publish }))

    expect(sent).toEqual(expect.arrayContaining([newType.id, newValue.id]))
  })

  it('measures what waits when scraped, on a replica that never relayed', async () => {
    await db.transaction(tx => enqueue(tx, anEvent()))
    const metrics = createMetrics()
    measureOutbox(db, metrics.registry, logger)

    const scraped = await metrics.registry.metrics()

    expect(scraped).toMatch(/^outbox_pending [1-9]/m)
    expect(scraped).toMatch(/^outbox_oldest_pending_seconds [\d.]+$/m)
  })

  it('reports no backlog it could not read in time, rather than the last one', async () => {
    const metrics = createMetrics()
    const warn = vi.spyOn(logger, 'warn')
    measureOutbox(db, metrics.registry, logger)
    const before = await metrics.registry.metrics()

    const scraped = await db.transaction(async tx => {
      await tx.execute(raw`lock table ${outbox} in access exclusive mode`)
      return metrics.registry.metrics()
    })
    const warned = warn.mock.calls.length
    warn.mockRestore()

    expect(before).toMatch(/^outbox_pending \d/m)
    expect(scraped).not.toMatch(/^outbox_pending /m)
    expect(scraped).not.toMatch(/^outbox_oldest_pending_seconds /m)
    expect(warned).toBe(1)
  })

  it('counts what it publishes and what fails', async () => {
    await db.transaction(async tx => {
      await enqueue(tx, anEvent())
      await enqueue(tx, anEvent())
    })
    const metrics = createMetrics()
    const failing = vi.fn(() => Promise.reject(new Error('broker down')))

    await createRelay({ db, logger, publish: failing, metrics }).relayOnce()
    const waiting = await metrics.registry.metrics()
    await drain(
      createRelay({ db, logger, publish: recorder().publish, metrics })
    )

    expect(waiting).toContain('outbox_publish_failures_total 1')
    expect(await metrics.registry.metrics()).toMatch(
      /^outbox_published_total ([2-9]|\d{2,})$/m
    )
  })
})
