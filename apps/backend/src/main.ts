import { pino } from 'pino'
import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'
import { postgresDeduplicator } from './events/dedupe.ts'
import { createRelay } from './events/outbox.ts'
import { createMessageHandler } from './events/router.ts'
import { assertRowLevelSecurity, createDb, migrateDb } from './infra/db.ts'
import {
  startConsumer,
  startDeadLetterProducer,
  startProducer
} from './infra/kafka.ts'
import { ldapRestClient } from './infra/ldapRest.ts'
import { createMailer } from './infra/mail.ts'
import { connectIdentityProvider } from './modules/auth/index.ts'
import { accountRoutes } from './modules/boards/accounts.ts'
import { PURGE_JOB, purgeTask } from './modules/boards/archive.ts'
import { listenToBoards } from './modules/boards/live.ts'
import {
  emailNotification,
  NOTIFICATION_EMAIL_JOB
} from './modules/boards/notificationEmails.ts'
import { deliverReminder, REMINDER_JOB } from './modules/boards/reminderJobs.ts'
import {
  PURGE_SPACE_JOB,
  purgeSpace,
  spaceRoutes
} from './modules/spaces/events.ts'
import { planReconcile, reconcileJobs } from './modules/spaces/reconcile.ts'
import { createScheduler } from './scheduler/scheduler.ts'

const config = loadConfig()
const logger = pino({ level: config.LOG_LEVEL })

const { sql, db } = createDb(config.DATABASE_URL, config.APP_URL)
await assertRowLevelSecurity(sql)
await migrateDb(db)

let accepting = false
const boardChanges = await listenToBoards(sql)
const server = await buildApp({
  logger,
  db,
  boardChanges,
  ...(await connectIdentityProvider({
    db,
    oidc: {
      issuer: new URL(config.OIDC_ISSUER),
      clientId: config.OIDC_CLIENT_ID,
      clientSecret: config.OIDC_CLIENT_SECRET,
      audience: config.OIDC_AUDIENCE
    }
  })),
  isReady: async () => accepting && (await sql`select 1`).length === 1
})
await server.listen({ host: config.HTTP_HOST, port: config.HTTP_PORT })

const producer = await startProducer(config, logger)
const deadLetters = await startDeadLetterProducer(config, logger)
const consumer = await startConsumer(
  config,
  logger,
  createMessageHandler({
    routes: {
      activity: new Map(),
      platform: new Map([...spaceRoutes(), ...accountRoutes])
    },
    dedupe: postgresDeduplicator(db, config.KAFKA_GROUP_ID),
    deadLetter: deadLetters.send,
    logger
  })
)
const stopScheduler = createScheduler({
  db,
  logger,
  handlers: {
    [REMINDER_JOB]: deliverReminder,
    [PURGE_JOB]: purgeTask,
    [PURGE_SPACE_JOB]: purgeSpace,
    [NOTIFICATION_EMAIL_JOB]: emailNotification({
      appUrl: config.APP_URL,
      send: createMailer(config, logger)
    }),
    ...reconcileJobs(
      ldapRestClient({
        url: config.LDAP_REST_URL,
        serviceId: config.LDAP_REST_SERVICE_ID,
        secret: config.LDAP_REST_SECRET
      })
    )
  }
}).start(5000)
await planReconcile(db)
const stopRelay = createRelay({
  db,
  logger,
  publish: (key, event) => producer.publish(key, event)
}).start(500)
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
    await consumer.disconnect()
    await stopRelay()
    await producer.disconnect()
    await deadLetters.disconnect()
    await server.close()
    await boardChanges.close()
    await sql.end({ timeout: 5 })
  } catch (error) {
    logger.error({ err: error }, 'shutdown failed')
    process.exitCode = 1
  }
}

process.once('SIGTERM', signal => void shutdown(signal))
process.once('SIGINT', signal => void shutdown(signal))
