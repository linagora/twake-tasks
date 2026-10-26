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
      if (metrics) {
        const [backlog] = await tx
          .select({
            pending: count(),
            waited: sql<number>`coalesce(extract(epoch from now() - min(${outbox.createdAt})), 0)::float8`
          })
          .from(outbox)
          .where(isNull(outbox.sentAt))
        metrics.outboxPending.set(backlog?.pending ?? 0)
        metrics.outboxOldestPending.set(backlog?.waited ?? 0)
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
