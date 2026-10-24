import { and, asc, eq, lte, sql } from 'drizzle-orm'
import type { Logger } from 'pino'
import type { Db, Tx } from '../infra/db.ts'
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

type Ran = { job: JobRow } & (
  { after: AfterCommit; lease: Date } | { after?: undefined; lease?: undefined }
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
}) {
  const kinds = Object.keys(deps.handlers)
  const now = deps.now ?? (() => new Date())
  const leaseMs = (deps.leaseSeconds ?? 600) * 1000
  const due = (kind: string) => and(eq(jobs.kind, kind), lte(jobs.runAt, now()))

  async function retryLater(db: Db | Tx, job: JobRow, error: unknown) {
    const attempts = job.attempts + 1
    const message = error instanceof Error ? error.message : String(error)
    deps.logger.warn({ err: error, job: job.id, attempts }, 'job failed')
    if (attempts >= MAX_ATTEMPTS) {
      deps.logger.error({ job: job.id, kind: job.kind }, 'job dropped')
      await db.delete(jobs).where(eq(jobs.id, job.id))
      return
    }
    await db
      .update(jobs)
      .set({
        attempts,
        lastError: message,
        runAt: sql`now() + ${`${String(30 * attempts ** 2)} seconds`}::interval`
      })
      .where(eq(jobs.id, job.id))
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
      } catch (error) {
        await retryLater(tx, job, error)
      }
      return { job }
    })
    if (!ran) return false
    const { job, after, lease } = ran
    if (after) {
      try {
        await after(deps.db)
        // Unless scheduled again under its key meanwhile.
        await deps.db
          .delete(jobs)
          .where(and(eq(jobs.id, job.id), eq(jobs.runAt, lease)))
      } catch (error) {
        await retryLater(deps.db, job, error)
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

  async function warnOnLag(kind: string) {
    const [oldest] = await deps.db
      .select({ runAt: jobs.runAt })
      .from(jobs)
      .where(due(kind))
      .orderBy(asc(jobs.runAt))
      .limit(1)
    const lag = oldest ? now().getTime() - oldest.runAt.getTime() : 0
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
              .then(() => warnOnLag(kind))
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
