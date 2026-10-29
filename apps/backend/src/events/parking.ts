import {
  and,
  asc,
  count,
  eq,
  exists,
  inArray,
  lt,
  lte,
  or,
  sql
} from 'drizzle-orm'
import type { Logger } from 'pino'
import type { Db } from '../infra/db.ts'
import type { Metrics } from '../infra/metrics.ts'
import type { Delivery } from './envelope.ts'
import { spaces } from '../modules/spaces/schema.ts'
import type { Outcome, Park } from './router.ts'
import { parkedEvents } from './schema.ts'

// RabbitMQ's default consumer_timeout: the event that brings the space can be
// held unacknowledged that long by a replica retrying it.
const WAIT = '30 minutes'
// A replica that stops while retrying leaves its rows to the others after it.
const CLAIM = '1 minute'
const RETRY_EVERY_MS = 5000
const BATCH = 100

export type DeadLetter = (delivery: Delivery, reason: string) => Promise<void>

export function parkIn(db: Db): Park {
  return async (delivery, spaceId, reason) => {
    await db
      .insert(parkedEvents)
      .values({
        messageId: delivery.messageId,
        exchange: delivery.exchange,
        routingKey: delivery.routingKey,
        body: delivery.body,
        spaceId,
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
  metrics?: Metrics | undefined
}) {
  const { db, logger, handle, deadLetter, metrics } = deps

  // Only rows whose space arrived, or that waited long enough, so the others
  // cost nothing. Claimed rather than locked, so replicas share the rows and
  // no connection waits in a transaction while they are retried.
  const claim = () =>
    db.transaction(async tx => {
      await tx.execute(sql`select set_config('app.space_lookup', 'on', true)`)
      const due = tx
        .select({ messageId: parkedEvents.messageId })
        .from(parkedEvents)
        .where(
          and(
            lte(parkedEvents.retryAt, sql`now()`),
            or(
              lt(parkedEvents.parkedAt, sql`now() - ${WAIT}::interval`),
              exists(
                tx
                  .select({ id: spaces.id })
                  .from(spaces)
                  .where(eq(spaces.id, parkedEvents.spaceId))
              )
            )
          )
        )
        .orderBy(asc(parkedEvents.parkedAt), asc(parkedEvents.messageId))
        .limit(BATCH)
        .for('update', { skipLocked: true })
      return tx
        .update(parkedEvents)
        .set({ retryAt: sql`now() + ${CLAIM}::interval` })
        .where(inArray(parkedEvents.messageId, due))
        .returning({
          messageId: parkedEvents.messageId,
          exchange: parkedEvents.exchange,
          routingKey: parkedEvents.routingKey,
          body: parkedEvents.body,
          reason: parkedEvents.reason,
          expired: sql<boolean>`${parkedEvents.parkedAt} < now() - ${WAIT}::interval`
        })
    })

  type Claimed = Awaited<ReturnType<typeof claim>>[number]

  // Once it waited long enough, an event goes to the dead letter queue unless
  // it applies. A rejected one goes at once. Until its dead letter is sent, it
  // stays for a later pass.
  async function retry(row: Claimed) {
    const delivery: Delivery = {
      exchange: row.exchange,
      routingKey: row.routingKey,
      messageId: row.messageId,
      body: row.body
    }
    const context = { routingKey: row.routingKey, messageId: row.messageId }
    let reason = row.reason
    let outcome: Outcome | undefined
    try {
      outcome = await handle(delivery)
    } catch (error) {
      logger.warn({ err: error, ...context }, 'parked event failed')
      reason = error instanceof Error ? error.message : String(error)
    }
    const rejected = outcome === 'rejected'
    if (outcome !== undefined && outcome !== 'parked' && !rejected) {
      await db
        .delete(parkedEvents)
        .where(eq(parkedEvents.messageId, row.messageId))
      return
    }
    if (rejected) reason = 'rejected'
    if (!row.expired && !rejected) return
    try {
      await deadLetter(delivery, reason)
    } catch (error) {
      logger.error(
        { err: error, ...context },
        'parked event could not reach the dead letter queue'
      )
      return
    }
    await db
      .delete(parkedEvents)
      .where(eq(parkedEvents.messageId, row.messageId))
    logger.warn(
      { ...context, reason },
      'parked event sent to the dead letter queue'
    )
  }

  const retryOnce = async () => {
    for (const row of await claim()) await retry(row)
    if (metrics) {
      const [parked] = await db.select({ count: count() }).from(parkedEvents)
      metrics.eventsParked.set(parked?.count ?? 0)
    }
  }

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
