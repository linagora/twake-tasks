import { setTimeout as delay } from 'node:timers/promises'
import { Gauge, type Registry } from '@prometheus-io/client'
import { asc, count, inArray, isNull, lt, sql } from 'drizzle-orm'
import type { Logger } from 'pino'
import type { Db, Tx } from '../infra/db.ts'
import type { Metrics } from '../infra/metrics.ts'
import {
  isKnownType,
  type PublishedEvent,
  publishedEvent
} from './published.ts'
import { outbox, processedEvents } from './schema.ts'

const BATCH = 100
const KEEP_SENT = '1 day'
// Far longer than any redelivery of a consumed event. Pruned under the relay's
// lock, so by one replica at a time.
const KEEP_PROCESSED = '30 days'
const PRUNE_PROCESSED_EVERY_MS = 60 * 60 * 1000
// Any constant shared by every replica: only the holder relays, so events leave in order.
const RELAY_LOCK = 0x7461736b

export async function enqueue(tx: Tx, event: PublishedEvent) {
  await tx.insert(outbox).values({ event })
}

const backlog = async (db: Db) => {
  const [row] = await db
    .select({
      pending: count(),
      waited: sql<number>`coalesce(extract(epoch from now() - min(${outbox.createdAt})), 0)::float8`
    })
    .from(outbox)
    .where(isNull(outbox.sentAt))
  return row
}

type Backlog = NonNullable<Awaited<ReturnType<typeof backlog>>>

// Well under Prometheus' scrape timeout: a slow database costs these two
// series, not the whole scrape.
const BACKLOG_TIMEOUT_MS = 1000

const backlogInTime = (db: Db) =>
  Promise.race([
    backlog(db),
    delay(BACKLOG_TIMEOUT_MS, undefined, { ref: false }).then(() => {
      throw new Error('outbox backlog read timed out')
    })
  ])

// Read when scraped, so every replica reports the same outbox whichever one
// relays. A failed read reports no series rather than a stale one, so an
// alert on the series being absent fires.
export function measureOutbox(db: Db, registry: Registry, logger: Logger) {
  // Both gauges are collected at once, so they share one read.
  let reading: Promise<Backlog | undefined> | undefined
  const read = () =>
    (reading ??= backlogInTime(db)
      .catch((error: unknown) => {
        logger.warn({ err: error }, 'outbox backlog unreadable')
        return undefined
      })
      .finally(() => {
        reading = undefined
      }))
  const gauge = (name: string, help: string, value: (row: Backlog) => number) =>
    new Gauge({
      name,
      help,
      registers: [registry],
      async collect() {
        const row = await read()
        if (row) this.set(value(row))
        else this.remove()
      }
    })
  gauge('outbox_pending', 'Events waiting in the outbox', row => row.pending)
  gauge(
    'outbox_oldest_pending_seconds',
    'How long the oldest event has waited in the outbox',
    row => row.waited
  )
}

export function createRelay(deps: {
  db: Db
  logger: Logger
  publish: (event: PublishedEvent) => Promise<void>
  metrics?: Metrics | undefined
}) {
  const metrics = deps.metrics
  let processedPrunedAt = -Infinity
  const locked = async (tx: Tx) => {
    const [lock] = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(${RELAY_LOCK}) as locked`
    )
    return lock?.locked === true
  }
  // A failure stops the batch so later events wait for it; what was already
  // published is marked sent, and the rest is retried on the next run.
  const relay = () =>
    deps.db.transaction(async tx => {
      if (!(await locked(tx))) return 0
      const pending = await tx
        .select()
        .from(outbox)
        .where(isNull(outbox.sentAt))
        .orderBy(asc(outbox.id))
        .limit(BATCH)
      const sent: number[] = []
      for (const row of pending) {
        const type = (row.event as { type?: unknown } | null)?.type
        const event = isKnownType(type)
          ? publishedEvent.safeParse(row.event)
          : { success: true as const, data: row.event as PublishedEvent }
        // Dropped rather than retried, since it would block every later event.
        if (!event.success) {
          deps.logger.error(
            {
              outbox: row.id,
              type,
              issues: event.error.issues.map(({ code, path }) => ({
                code,
                path: path.join('.')
              }))
            },
            'relay dropped an invalid event'
          )
          sent.push(row.id)
          continue
        }
        try {
          await deps.publish(event.data)
        } catch (error) {
          deps.logger.warn({ err: error, outbox: row.id }, 'relay failed')
          metrics?.outboxPublishFailures.inc()
          break
        }
        sent.push(row.id)
      }
      if (sent.length > 0) {
        await tx
          .update(outbox)
          .set({ sentAt: sql`now()` })
          .where(inArray(outbox.id, sent))
        metrics?.outboxPublished.inc(sent.length)
      }
      await tx
        .delete(outbox)
        .where(lt(outbox.sentAt, sql`now() - ${KEEP_SENT}::interval`))
      return sent.length
    })
  // Its own transaction, so a failed prune never undoes marking events sent.
  const pruneProcessed = () =>
    deps.db.transaction(async tx => {
      if (!(await locked(tx))) return false
      await tx
        .delete(processedEvents)
        .where(
          lt(
            processedEvents.processedAt,
            sql`now() - ${KEEP_PROCESSED}::interval`
          )
        )
      return true
    })
  const relayOnce = async () => {
    const sent = await relay()
    if (
      Date.now() - processedPrunedAt >= PRUNE_PROCESSED_EVERY_MS &&
      (await pruneProcessed())
    ) {
      processedPrunedAt = Date.now()
    }
    return sent
  }

  return {
    relayOnce,
    start(intervalMs: number) {
      let running = Promise.resolve()
      const timer = setInterval(() => {
        running = running
          .then(async () => {
            while ((await relayOnce()) === BATCH);
          })
          .catch((error: unknown) => {
            deps.logger.error({ err: error }, 'relay run failed')
          })
      }, intervalMs)
      return async () => {
        clearInterval(timer)
        await running
      }
    }
  }
}
