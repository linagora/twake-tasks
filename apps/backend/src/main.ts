import { readFileSync } from 'node:fs'
import { pino } from 'pino'
import postgres from 'postgres'
import { buildApp } from './app.ts'
import { loadConfig, rateLimits } from './config.ts'
import { postgresDeduplicator } from './events/dedupe.ts'
import { createRelay, measureOutbox } from './events/outbox.ts'
import { parkedRetries, parkIn } from './events/parking.ts'
import { createMessageHandler } from './events/router.ts'
import { createChanges } from './infra/changes.ts'
import {
  assertRowLevelSecurity,
  createDb,
  migrateLocked,
  pendingMigrations
} from './infra/db.ts'
import { ldapRestClient } from './infra/ldapRest.ts'
import { startErrorReporting } from './infra/errorReporting.ts'
import { createMailer } from './infra/mail.ts'
import { createMetrics } from './infra/metrics.ts'
import { connectRedis } from './infra/rateLimit.ts'
import {
  connectLive,
  requestSpaceSync,
  startConsumer,
  startPublisher
} from './infra/rabbitmq.ts'
import { accountRoutes } from './modules/accounts/accounts.ts'
import { connectIdentityProvider } from './modules/auth/index.ts'
import { jobHandlers } from './jobHandlers.ts'
import { PROJECT_INVITE_EMAIL_JOB } from './modules/boards/inviteEmails.ts'
import { listenForBoardChanges } from './modules/boards/live.ts'
import { NOTIFICATION_DIGEST_JOB } from './modules/boards/notificationDigest.ts'
import { NOTIFICATION_EMAIL_JOB } from './modules/boards/notificationEmails.ts'
import { knowsAnySpace, spaceRoutes } from './modules/spaces/events.ts'
import { RECONCILE_SPACES_JOB } from './modules/spaces/reconcile.ts'
import { settingsRoutes } from './modules/settings/events.ts'
import { RETENTION_JOB } from './retention.ts'
import { createScheduler, plan } from './scheduler/scheduler.ts'

const config = loadConfig()
const stopErrorReporting = config.SENTRY_DSN
  ? startErrorReporting({
      dsn: config.SENTRY_DSN,
      environment: config.SENTRY_ENVIRONMENT,
      release: (
        JSON.parse(
          readFileSync(new URL('../package.json', import.meta.url), 'utf8')
        ) as { version: string }
      ).version
    })
  : undefined
const limits = rateLimits(config)
const logger = pino({ level: config.LOG_LEVEL })
const spaces = config.SPACE_INTEGRATION === 'true'
const metrics = config.METRICS_ENABLED ? createMetrics() : undefined

const { sql, db } = createDb(config.DATABASE_URL, logger, {
  poolMax: config.DATABASE_POOL_MAX,
  statementTimeoutMs: config.DATABASE_STATEMENT_TIMEOUT_MS
})
await assertRowLevelSecurity(sql, logger)
if (config.MIGRATE_ON_START) {
  await migrateLocked(
    config.DATABASE_MIGRATION_URL ?? config.DATABASE_URL,
    config.DATABASE_URL
  )
}
// Readiness must not wait behind the requests that fill the pool.
const probe = postgres(config.DATABASE_URL, { max: 1 })
// Without MIGRATE_ON_START, a replica may start before its release migrated.
let pending = await pendingMigrations(probe)
if (pending.length > 0) {
  logger.error(
    { pending },
    'the database lacks migrations this image ships, not ready until they run'
  )
}
async function schemaCurrent(): Promise<boolean> {
  if (pending.length > 0) pending = await pendingMigrations(probe)
  return pending.length === 0
}

let accepting = false
const boardChanges = createChanges()
const redis = config.REDIS_URL
  ? connectRedis(config.REDIS_URL, logger)
  : undefined
const server = await buildApp({
  logger,
  proxyHops: config.HTTP_TRUSTED_PROXY_HOPS,
  redis,
  limits,
  metrics,
  db,
  boardChanges,
  ...(await connectIdentityProvider({
    db,
    limits,
    oidc: {
      issuer: new URL(config.OIDC_ISSUER),
      clientId: config.OIDC_CLIENT_ID,
      clientSecret: config.OIDC_CLIENT_SECRET,
      audience: config.OIDC_AUDIENCE,
      searchAudiences: config.OIDC_SEARCH_AUDIENCES
    }
  })),
  searchAllowedOrigins: config.SEARCH_ALLOWED_ORIGINS,
  searchMinLength: config.SEARCH_MIN_LENGTH,
  isReady: async () =>
    accepting && (await probe`select 1`).length === 1 && (await schemaCurrent())
})
await server.listen({ host: config.HTTP_HOST, port: config.HTTP_PORT })

const live = await connectLive(config.RABBITMQ_URL, logger)
await listenForBoardChanges(
  live,
  config.RABBITMQ_LIVE_EXCHANGE,
  boardChanges,
  logger
)
const publisher = await startPublisher(
  config.RABBITMQ_URL,
  config.RABBITMQ_ACTIVITY_EXCHANGE,
  logger
)
const handling = {
  // The queue stays bound to space events either way, since its first binding
  // fixes its dead letter key; without the integration they find no route.
  routes: new Map([
    ...(spaces ? spaceRoutes() : []),
    ...accountRoutes,
    ...settingsRoutes
  ]),
  dedupe: postgresDeduplicator(db, 'twake-tasks'),
  park: parkIn(db),
  logger
}
const handle = createMessageHandler({ ...handling, metrics })
const consumer = await startConsumer(
  config.RABBITMQ_URL,
  {
    spaceExchange: config.RABBITMQ_SPACE_EXCHANGE,
    b2bExchange: config.RABBITMQ_B2B_EXCHANGE,
    authExchange: config.RABBITMQ_AUTH_EXCHANGE,
    settingsExchange: config.RABBITMQ_SETTINGS_EXCHANGE,
    queue: config.RABBITMQ_QUEUE,
    oldQueue: config.RABBITMQ_OLD_QUEUE,
    deadLetterExchange: config.RABBITMQ_DEAD_LETTER_EXCHANGE
  },
  logger,
  handle,
  { concurrency: config.RABBITMQ_CONCURRENCY }
)
const stopParkedRetries = parkedRetries({
  db,
  logger,
  // Uncounted: a delivery was counted once, when it came off the queue.
  handle: createMessageHandler(handling),
  deadLetter: (delivery, reason) => consumer.deadLetter(delivery, reason),
  metrics
}).start()
// A sync request fans out to every app and every space, so it is sent only
// while no space is known, once the queue is bound to receive the answers.
// The nightly sync repairs what a failed request misses, so it never stops
// the start.
if (spaces && !(await knowsAnySpace(db))) {
  try {
    await requestSpaceSync(
      config.RABBITMQ_URL,
      config.RABBITMQ_SPACE_EXCHANGE,
      logger
    )
    logger.info('no space known yet, sync of every organization requested')
  } catch (error) {
    logger.error({ err: error }, 'space sync request failed')
  }
}
const send = createMailer(config, logger)
const stopScheduler = createScheduler({
  db,
  logger,
  leaseSeconds: config.JOBS_LEASE_SECONDS,
  metrics,
  // A mail job spends most of its time on SMTP, after its transaction ended.
  concurrency: kind =>
    [
      NOTIFICATION_EMAIL_JOB,
      NOTIFICATION_DIGEST_JOB,
      PROJECT_INVITE_EMAIL_JOB
    ].includes(kind)
      ? config.JOBS_EMAIL_CONCURRENCY
      : config.JOBS_CONCURRENCY,
  handlers: jobHandlers({
    appUrl: config.APP_URL,
    budget: limits.notificationEmails,
    send,
    retention: {
      processedEventsDays: config.RETENTION_PROCESSED_EVENTS_DAYS,
      readNotificationsDays: config.RETENTION_READ_NOTIFICATIONS_DAYS
    },
    ldapRest: spaces
      ? ldapRestClient({
          url: config.LDAP_REST_URL,
          serviceId: config.LDAP_REST_SERVICE_ID,
          secret: config.LDAP_REST_SECRET
        })
      : undefined
  })
}).start(5000)
await plan(db, RETENTION_JOB)
if (spaces) await plan(db, RECONCILE_SPACES_JOB)
const stopRelay = createRelay({
  db,
  logger,
  publish: event => publisher.publish(event),
  metrics
}).start(500)
if (metrics) measureOutbox(db, metrics.registry, logger)
accepting = true
logger.info('twake-tasks backend started')

let stopping = false
async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true
  accepting = false
  logger.info({ signal }, 'shutting down')
  try {
    await stopScheduler()
    // A retry pass may still dead letter through the consumer's connection.
    await stopParkedRetries()
    await consumer.close()
    await stopRelay()
    await publisher.close()
    await server.close()
    redis?.disconnect()
    await live.close()
    await sql.end({ timeout: 5 })
    await probe.end({ timeout: 5 })
  } catch (error) {
    logger.error({ err: error }, 'shutdown failed')
    process.exitCode = 1
  }
  await stopErrorReporting?.()
}

process.once('SIGTERM', signal => void shutdown(signal))
process.once('SIGINT', signal => void shutdown(signal))
