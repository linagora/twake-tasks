import { and, asc, eq, lt, sql } from 'drizzle-orm'
import type { Logger } from 'pino'
import type { Db } from '../infra/db.ts'
import type { Delivery } from '../infra/rabbitmq.ts'
import type { Outcome, Park } from './router.ts'
import { parkedEvents } from './schema.ts'

// RabbitMQ's default consumer_timeout: the event that brings the space can be
// held unacknowledged that long by a replica retrying it.
const WAIT = '30 minutes'
const RETRY_EVERY_MS = 5000
const BATCH = 100
// Any constant shared by every replica: only the holder retries.
const RETRY_LOCK = 0x7061726b

export type DeadLetter = (delivery: Delivery, reason: string) => Promise<void>

export function parkIn(db: Db): Park {
  return async (delivery, reason) => {
    await db
      .insert(parkedEvents)
      .values({
        messageId: delivery.messageId,
        exchange: delivery.exchange,
        routingKey: delivery.routingKey,
        body: delivery.body,
        reason
      })
      .onConflictDoNothing()
  }
}

export function parkedRetries(deps: {
  db: Db
  logger: Logger
  handle: (delivery: Delivery) => Promise<Outcome>
  deadLetter: DeadLetter
}) {
  const { db, logger, handle, deadLetter } = deps

  // A retry that throws keeps its row for the next pass. A dead letter that
  // fails to send keeps it too.
  async function retry(row: typeof parkedEvents.$inferSelect) {
    const delivery: Delivery = {
      exchange: row.exchange,
      routingKey: row.routingKey,
      messageId: row.messageId,
      body: row.body
    }
    const context = { routingKey: row.routingKey, messageId: row.messageId }
    const parked = eq(parkedEvents.messageId, row.messageId)
    let outcome: Outcome
    try {
      outcome = await handle(delivery)
    } catch (error) {
      logger.warn({ err: error, ...context }, 'parked event failed')
      return
    }
    if (outcome !== 'parked') {
      await db.delete(parkedEvents).where(parked)
      return
    }
    await db
      .transaction(async tx => {
        const [expired] = await tx
          .delete(parkedEvents)
          .where(
            and(
              parked,
              lt(parkedEvents.parkedAt, sql`now() - ${WAIT}::interval`)
            )
          )
          .returning({ reason: parkedEvents.reason })
        if (!expired) return
        await deadLetter(delivery, expired.reason)
        logger.warn(
          { ...context, reason: expired.reason },
          'parked event sent to the dead letter queue'
        )
      })
      .catch((error: unknown) => {
        logger.error(
          { err: error, ...context },
          'parked event could not reach the dead letter queue'
        )
      })
  }

  const retryOnce = () =>
    db.transaction(async tx => {
      const [lock] = await tx.execute<{ locked: boolean }>(
        sql`select pg_try_advisory_xact_lock(${RETRY_LOCK}) as locked`
      )
      if (!lock?.locked) return
      const rows = await db
        .select()
        .from(parkedEvents)
        .orderBy(asc(parkedEvents.parkedAt), asc(parkedEvents.messageId))
        .limit(BATCH)
      for (const row of rows) await retry(row)
    })

  return {
    retryOnce,
    // The next pass starts once the previous one ended.
    start(intervalMs = RETRY_EVERY_MS) {
      let timer: NodeJS.Timeout | undefined
      let stopped = false
      let running = Promise.resolve()
      const loop = () => {
        running = retryOnce()
          .catch((error: unknown) => {
            logger.error({ err: error }, 'retrying parked events failed')
          })
          .finally(() => {
            if (!stopped) timer = setTimeout(loop, intervalMs)
          })
      }
      timer = setTimeout(loop, intervalMs)
      return async () => {
        stopped = true
        clearTimeout(timer)
        await running
      }
    }
  }
}
