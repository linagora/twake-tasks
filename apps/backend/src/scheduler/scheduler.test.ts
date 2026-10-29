import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { pino } from 'pino'
import { afterAll, describe, expect, inject, it, vi } from 'vitest'
import { createDb } from '../infra/db.ts'
import { createMetrics } from '../infra/metrics.ts'
import { createScheduler, schedule, type Handler } from './scheduler.ts'
import { jobs } from './schema.ts'

const { sql, db } = createDb(inject('databaseUrl'))
const logger = pino({ level: 'silent' })

afterAll(async () => {
  await sql.end()
})

const past = () => new Date(Date.now() - 1000)

function aKind() {
  return `test-${randomUUID()}`
}

describe('scheduler', () => {
  it('runs a due job once, and leaves a future one waiting', async () => {
    const kind = aKind()
    const ran: unknown[] = []
    const scheduler = createScheduler({
      db,
      logger,
      handlers: {
        [kind]: payload => {
          ran.push(payload)
          return Promise.resolve(undefined)
        }
      }
    })
    await schedule(db, { kind, payload: { n: 1 }, runAt: past() })
    await schedule(db, {
      kind,
      payload: { n: 2 },
      runAt: new Date(Date.now() + 60_000)
    })

    expect(await scheduler.runDue()).toBe(1)
    expect(await scheduler.runDue()).toBe(0)
    expect(ran).toEqual([{ n: 1 }])
  })

  it('runs each job once across replicas', async () => {
    const kind = aKind()
    const ran: unknown[] = []
    const handlers: Record<string, Handler> = {
      [kind]: async payload => {
        ran.push(payload)
        await new Promise(resolve => setTimeout(resolve, 5))
        return undefined
      }
    }
    for (let n = 0; n < 20; n++) {
      await schedule(db, { kind, payload: n, runAt: past() })
    }

    const replicas = [1, 2, 3].map(() =>
      createScheduler({ db, logger, handlers })
    )
    const counts = await Promise.all(replicas.map(replica => replica.runDue()))

    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(20)
    expect(new Set(ran).size).toBe(20)
    expect(ran).toHaveLength(20)
  })

  it('retries a failed job later, without its partial work', async () => {
    const kind = aKind()
    const marker = aKind()
    const scheduler = createScheduler({
      db,
      logger,
      handlers: {
        [kind]: async (_payload, tx) => {
          await schedule(tx, { kind: marker, payload: null, runAt: past() })
          throw new Error('mail server down')
        }
      }
    })
    await schedule(db, { kind, payload: null, runAt: past() })

    expect(await scheduler.runDue()).toBe(1)

    const [job] = await db.select().from(jobs).where(eq(jobs.kind, kind))
    expect(job).toMatchObject({ attempts: 1, lastError: 'mail server down' })
    expect(job?.runAt.getTime()).toBeGreaterThan(Date.now())
    expect(await db.select().from(jobs).where(eq(jobs.kind, marker))).toEqual(
      []
    )
  })

  it('logs the failure of a job with the request that scheduled it', async () => {
    const kind = aKind()
    const requestId = randomUUID()
    const watched = logger.child({})
    const warn = vi.spyOn(watched, 'warn')
    const scheduler = createScheduler({
      db,
      logger: watched,
      handlers: { [kind]: () => Promise.reject(new Error('mail server down')) }
    })
    await db
      .insert(jobs)
      .values({ kind, payload: {}, runAt: past(), requestId })

    await scheduler.runDue()

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ reqId: requestId }),
      'job failed'
    )
  })

  it('keeps a job its handler moved to run again', async () => {
    const kind = aKind()
    const key = randomUUID()
    const scheduler = createScheduler({
      db,
      logger,
      handlers: {
        [kind]: async (_payload, tx) => {
          await schedule(tx, {
            kind,
            key,
            payload: 2,
            runAt: new Date(Date.now() + 60_000)
          })
          return 'keep'
        }
      }
    })
    await schedule(db, { kind, key, payload: 1, runAt: past() })

    expect(await scheduler.runDue()).toBe(1)

    expect(
      await db
        .select({ payload: jobs.payload })
        .from(jobs)
        .where(eq(jobs.kind, kind))
    ).toEqual([{ payload: 2 }])
  })

  it('runs the work after the commit with the job row unlocked, then drops the job', async () => {
    const kind = aKind()
    const locked: boolean[] = []
    const scheduler = createScheduler({
      db,
      logger,
      handlers: {
        [kind]: () =>
          Promise.resolve(async outside => {
            const rows = await outside.transaction(tx =>
              tx
                .select({ id: jobs.id })
                .from(jobs)
                .where(eq(jobs.kind, kind))
                .for('update', { skipLocked: true })
            )
            locked.push(rows.length === 0)
          })
      }
    })
    await schedule(db, { kind, payload: null, runAt: past() })

    expect(await scheduler.runDue()).toBe(1)

    expect(locked).toEqual([false])
    expect(await db.select().from(jobs).where(eq(jobs.kind, kind))).toEqual([])
  })

  it('retries a job whose work after the commit failed', async () => {
    const kind = aKind()
    const scheduler = createScheduler({
      db,
      logger,
      handlers: {
        [kind]: () =>
          Promise.resolve(() => Promise.reject(new Error('mail server down')))
      }
    })
    await schedule(db, { kind, payload: null, runAt: past() })

    expect(await scheduler.runDue()).toBe(1)

    const [job] = await db.select().from(jobs).where(eq(jobs.kind, kind))
    expect(job).toMatchObject({ attempts: 1, lastError: 'mail server down' })
    expect(job?.runAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('leases a job while its work after the commit runs, so no replica runs it twice', async () => {
    const kind = aKind()
    let release = () => {}
    const released = new Promise<void>(resolve => {
      release = resolve
    })
    let started = () => {}
    const sending = new Promise<void>(resolve => {
      started = resolve
    })
    let runs = 0
    const handlers: Record<string, Handler> = {
      [kind]: () => {
        runs++
        return Promise.resolve(async () => {
          started()
          await released
        })
      }
    }
    const first = createScheduler({ db, logger, handlers })
    const second = createScheduler({ db, logger, handlers })
    await schedule(db, { kind, payload: null, runAt: past() })

    const running = first.runDue()
    await sending
    expect(await second.runDue()).toBe(0)
    release()
    expect(await running).toBe(1)
    expect(runs).toBe(1)
  })

  it('runs each kind on its own, so a slow kind does not hold up another', async () => {
    const slow = aKind()
    const quick = aKind()
    let release = () => {}
    const released = new Promise<void>(resolve => {
      release = resolve
    })
    const scheduler = createScheduler({
      db,
      logger,
      handlers: {
        [slow]: async () => {
          await released
          return undefined
        },
        [quick]: () => {
          release()
          return Promise.resolve(undefined)
        }
      }
    })
    await schedule(db, {
      kind: slow,
      payload: null,
      runAt: new Date(Date.now() - 2000)
    })
    await schedule(db, { kind: quick, payload: null, runAt: past() })

    expect(await scheduler.runDue()).toBe(2)
  })

  it('runs as many jobs of a kind at once as its concurrency', async () => {
    const kind = aKind()
    let waiting = 0
    let release = () => {}
    const bothStarted = new Promise<void>(resolve => {
      release = resolve
    })
    const scheduler = createScheduler({
      db,
      logger,
      concurrency: () => 2,
      handlers: {
        [kind]: async () => {
          if (++waiting === 2) release()
          await bothStarted
          return undefined
        }
      }
    })
    await schedule(db, { kind, payload: 1, runAt: past() })
    await schedule(db, { kind, payload: 2, runAt: past() })

    expect(await scheduler.runDue()).toBe(2)
  })

  it('moves a job scheduled again under the same key', async () => {
    const kind = aKind()
    const key = randomUUID()
    const later = new Date(Date.now() + 3_600_000)

    await schedule(db, { kind, key, payload: 1, runAt: past() })
    await schedule(db, { kind, key, payload: 2, runAt: later })

    expect(
      await db
        .select({ payload: jobs.payload, runAt: jobs.runAt })
        .from(jobs)
        .where(eq(jobs.kind, kind))
    ).toEqual([{ payload: 2, runAt: later }])
  })

  it('counts its jobs by kind and outcome, and measures what is due', async () => {
    const kind = aKind()
    const metrics = createMetrics()
    const scheduler = createScheduler({
      db,
      logger,
      metrics,
      handlers: {
        [kind]: payload =>
          payload === 'fails'
            ? Promise.reject(new Error('mail server down'))
            : Promise.resolve(undefined)
      }
    })
    await schedule(db, { kind, payload: 'works', runAt: past() })
    await schedule(db, { kind, payload: 'fails', runAt: past() })
    await schedule(db, { kind, key: kind, payload: 'fails', runAt: past() })
    await db.update(jobs).set({ attempts: 9 }).where(eq(jobs.key, kind))

    const stop = scheduler.start(10)
    await vi.waitFor(async () => {
      expect(await metrics.registry.metrics()).toContain(
        `jobs_due{kind="${kind}"} 0`
      )
    })
    await stop()

    const text = await metrics.registry.metrics()
    for (const outcome of ['done', 'retried', 'dropped']) {
      expect(text).toContain(
        `jobs_run_total{kind="${kind}",outcome="${outcome}"} 1`
      )
    }
    expect(text).toContain(`jobs_oldest_due_seconds{kind="${kind}"} 0`)
  })

  it('counts no drop of a kind before its first one, so the first drop shows as an increase', async () => {
    const kind = aKind()
    const metrics = createMetrics()
    createScheduler({
      db,
      logger,
      metrics,
      handlers: { [kind]: () => Promise.resolve(undefined) }
    })

    expect(await metrics.registry.metrics()).toContain(
      `jobs_run_total{kind="${kind}",outcome="dropped"} 0`
    )
  })

  it('measures what is due while a drain of the kind is stuck', async () => {
    const kind = aKind()
    const metrics = createMetrics()
    const { promise: stuck, resolve: release } =
      Promise.withResolvers<undefined>()
    const scheduler = createScheduler({
      db,
      logger,
      metrics,
      handlers: { [kind]: () => stuck }
    })
    await schedule(db, { kind, payload: 1, runAt: past() })
    await schedule(db, { kind, payload: 2, runAt: past() })

    const stop = scheduler.start(10)
    await vi.waitFor(async () => {
      expect(await metrics.registry.metrics()).toContain(
        `jobs_due{kind="${kind}"} 2`
      )
    })
    release(undefined)
    await stop()
  })
})
