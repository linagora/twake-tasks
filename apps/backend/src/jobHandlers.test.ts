import { pino } from 'pino'
import { afterAll, expect, inject, it } from 'vitest'
import { createDb } from './infra/db.ts'
import { createMetrics } from './infra/metrics.ts'
import { jobHandlers } from './jobHandlers.ts'
import { createScheduler } from './scheduler/scheduler.ts'

const { sql, db } = createDb(inject('databaseUrl'))

afterAll(async () => {
  await sql.end()
})

it('measures the backlog of every job kind the app runs', async () => {
  const handlers = jobHandlers({
    appUrl: 'https://tasks.example',
    budget: { max: 1, windowSeconds: 60 },
    send: () => Promise.resolve(),
    retention: { processedEventsDays: 30, readNotificationsDays: 180 },
    ldapRest: {
      organizations: () => Promise.resolve([]),
      spaceIds: () => Promise.resolve([]),
      space: () => Promise.resolve(null)
    }
  })
  const metrics = createMetrics()

  await createScheduler({
    db,
    logger: pino({ level: 'silent' }),
    handlers,
    metrics
  }).measure()

  const scraped = await metrics.registry.metrics()
  for (const kind of Object.keys(handlers)) {
    expect(scraped).toContain(`jobs_due{kind="${kind}"}`)
    expect(scraped).toContain(`jobs_oldest_due_seconds{kind="${kind}"}`)
  }
})
