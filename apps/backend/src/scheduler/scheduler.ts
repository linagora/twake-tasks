import { and, asc, count, eq, lte, min, sql } from 'drizzle-orm'
import type { Logger } from 'pino'
import type { Db, Tx } from '../infra/db.ts'
import type { Metrics } from '../infra/metrics.ts'
import { jobs } from './schema.ts'

/** Work a job does once its transaction committed, such as sending a mail. */
export type AfterCommit = (db: Db) => Promise<void>

/** Resolves to "keep" when the handler moved its job to run again. */
export type Handler = (
  payload: unknown,
  tx: Tx
) => Promise<'keep' | AfterCommit | undefined>

const MAX_ATTEMPTS = 10
const LAG_WARNING_MS = 60_000

export interface Job {
  kind: string
  /** A job scheduled again under the same key replaces the waiting one. */
  key?: string
  payload: unknown
  runAt: Date
}

type JobRow = typeof jobs.$inferSelect

type Outcome = 'done' | 'retried' | 'dropped'

type Ran = { job: JobRow } & (
  | { after: AfterCommit; lease: Date; outcome?: undefined }
  | { after?: undefined; lease?: undefined; outcome: Outcome }
)

export async function schedule(db: Db | Tx, job: Job): Promise<void> {
  const row = { ...job, payload: sql`${JSON.stringify(job.payload)}::jsonb` }
  if (job.key === undefined) {
    await db.insert(jobs).values(row)
    return
  }
  await db
    .insert(jobs)
    .values(row)
    .onConflictDoUpdate({
      target: jobs.key,
      set: { ...row, attempts: 0, lastError: null }
    })
}

export async function unschedule(db: Db | Tx, key: string): Promise<void> {
  await db.delete(jobs).where(eq(jobs.key, key))
}

// Each job runs in its own transaction, which holds the row lock until the job
// is done, so other replicas skip it. A failure rolls back the job's work and
// retries it later. Work after the commit runs under a lease instead: the job
// waits until the lease ends, so a crash leaves it to run again then.
// Each kind drains on its own, so a backlog of one never holds up the others.
export function createScheduler(deps: {
  db: Db
  logger: Logger
  handlers: Record<string, Handler>
  /** Jobs of a kind run at once on each replica, 1 when not given. */
  concurrency?: (kind: string) => number
  leaseSeconds?: number
  now?: () => Date
  metrics?: Metrics | undefined
}) {
  const kinds = Object.keys(deps.handlers)
  const record = (kind: string, outcome: Outcome) =>
    deps.metrics?.jobsRun.inc({ kind, outcome })
  const now = deps.now ?? (() => new Date())
  const leaseMs = (deps.leaseSeconds ?? 600) * 1000
  const due = (kind: string) => and(eq(jobs.kind, kind), lte(jobs.runAt, now()))

  // A leased job scheduled again under its key meanwhile is left as it is.
  async function retryLater(
    db: Db | Tx,
    job: JobRow,
    error: unknown,
    lease?: Date
  ): Promise<Outcome> {
    const attempts = job.attempts + 1
    const message = error instanceof Error ? error.message : String(error)
    deps.logger.warn({ err: error, job: job.id, attempts }, 'job failed')
    const same = and(
      eq(jobs.id, job.id),
      lease ? eq(jobs.runAt, lease) : undefined
    )
    if (attempts >= MAX_ATTEMPTS) {
      deps.logger.error({ job: job.id, kind: job.kind }, 'job dropped')
      await db.delete(jobs).where(same)
      return 'dropped'
    }
    await db
      .update(jobs)
      .set({
        attempts,
        lastError: message,
        runAt: sql`now() + ${`${String(30 * attempts ** 2)} seconds`}::interval`
      })
      .where(same)
    return 'retried'
  }

  async function runOne(kind: string): Promise<boolean> {
    const handler = deps.handlers[kind]
    const ran = await deps.db.transaction(async (tx): Promise<Ran | null> => {
      const [job] = await tx
        .select()
        .from(jobs)
        .where(due(kind))
        .orderBy(asc(jobs.runAt))
        .limit(1)
        .for('update', { skipLocked: true })
      if (!job) return null
      try {
        const outcome = await tx.transaction(savepoint =>
          handler ? handler(job.payload, savepoint) : Promise.resolve(undefined)
        )
        if (typeof outcome === 'function') {
          const lease = new Date(now().getTime() + leaseMs)
          await tx.update(jobs).set({ runAt: lease }).where(eq(jobs.id, job.id))
          return { job, after: outcome, lease }
        }
        if (outcome !== 'keep') {
          await tx.delete(jobs).where(eq(jobs.id, job.id))
        }
        return { job, outcome: 'done' }
      } catch (error) {
        return { job, outcome: await retryLater(tx, job, error) }
      }
    })
    if (!ran) return false
    // Counted once the transaction committed, so a rolled back run is not.
    if (ran.outcome) record(kind, ran.outcome)
    const { job, after, lease } = ran
    if (after) {
      try {
        await after(deps.db)
        await deps.db
          .delete(jobs)
          .where(and(eq(jobs.id, job.id), eq(jobs.runAt, lease)))
        record(kind, 'done')
      } catch (error) {
        record(kind, await retryLater(deps.db, job, error, lease))
      }
    }
    return true
  }

  async function drain(kind: string, limit: number): Promise<number> {
    let ran = 0
    const worker = async () => {
      while (ran < limit) {
        ran++
        if (!(await runOne(kind))) {
          ran--
          return
        }
      }
    }
    const workers = Math.max(1, deps.concurrency?.(kind) ?? 1)
    await Promise.all(Array.from({ length: workers }, worker))
    return ran
  }

  async function runDue(limit = 100): Promise<number> {
    const counts = await Promise.all(kinds.map(kind => drain(kind, limit)))
    return counts.reduce((sum, count) => sum + count, 0)
  }

  async function measureLag(kind: string) {
    const [backlog] = await deps.db
      .select({ due: count(), oldest: min(jobs.runAt) })
      .from(jobs)
      .where(due(kind))
    const oldest = backlog?.oldest
    const lag = oldest ? now().getTime() - oldest.getTime() : 0
    deps.metrics?.jobsDue.set({ kind }, backlog?.due ?? 0)
    deps.metrics?.jobsOldestDue.set({ kind }, lag / 1000)
    if (lag > LAG_WARNING_MS) {
      deps.logger.warn({ kind, lagMs: lag }, 'jobs are late')
    }
  }

  return {
    runDue,
    start(intervalMs: number) {
      const running = new Map<string, Promise<void>>()
      const timer = setInterval(() => {
        for (const kind of kinds) {
          if (running.has(kind)) continue
          running.set(
            kind,
            drain(kind, 100)
              .then(() => measureLag(kind))
              .catch((error: unknown) => {
                deps.logger.error({ err: error, kind }, 'scheduler tick failed')
              })
              .finally(() => running.delete(kind))
          )
        }
      }, intervalMs)
      return async () => {
        clearInterval(timer)
        await Promise.all(running.values())
      }
    }
  }
}
