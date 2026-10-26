import { asc, inArray, isNull, lt, sql } from 'drizzle-orm'
import type { Logger } from 'pino'
import type { Db, Tx } from '../infra/db.ts'
import type { OutgoingEvent } from './envelope.ts'
import { outbox, processedEvents } from './schema.ts'

const BATCH = 100
const KEEP_SENT = '1 day'
// Far longer than any redelivery of a consumed event. Pruned under the relay's
// lock, so by one replica at a time.
const KEEP_PROCESSED = '30 days'
const PRUNE_PROCESSED_EVERY_MS = 60 * 60 * 1000
// Any constant shared by every replica: only the holder relays, so events leave in order.
const RELAY_LOCK = 0x7461736b

export async function enqueue(tx: Tx, event: OutgoingEvent) {
  await tx.insert(outbox).values({ event })
}

export function createRelay(deps: {
  db: Db
  logger: Logger
  publish: (event: OutgoingEvent) => Promise<void>
}) {
  let processedPrunedAt = -Infinity
  // A failure stops the batch so later events wait for it; what was already
  // published is marked sent, and the rest is retried on the next run.
  const relayOnce = () =>
    deps.db.transaction(async tx => {
      const [lock] = await tx.execute<{ locked: boolean }>(
        sql`select pg_try_advisory_xact_lock(${RELAY_LOCK}) as locked`
      )
      if (!lock?.locked) return 0
      const pending = await tx
        .select()
        .from(outbox)
        .where(isNull(outbox.sentAt))
        .orderBy(asc(outbox.id))
        .limit(BATCH)
      const sent: number[] = []
      for (const row of pending) {
        try {
          await deps.publish(row.event as OutgoingEvent)
        } catch (error) {
          deps.logger.warn({ err: error, outbox: row.id }, 'relay failed')
          break
        }
        sent.push(row.id)
      }
      if (sent.length > 0) {
        await tx
          .update(outbox)
          .set({ sentAt: sql`now()` })
          .where(inArray(outbox.id, sent))
      }
      await tx
        .delete(outbox)
        .where(lt(outbox.sentAt, sql`now() - ${KEEP_SENT}::interval`))
      if (Date.now() - processedPrunedAt >= PRUNE_PROCESSED_EVERY_MS) {
        processedPrunedAt = Date.now()
        await tx
          .delete(processedEvents)
          .where(
            lt(
              processedEvents.processedAt,
              sql`now() - ${KEEP_PROCESSED}::interval`
            )
          )
      }
      return sent.length
    })

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
