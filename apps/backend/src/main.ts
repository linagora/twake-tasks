import { pino } from 'pino'
import { loadConfig } from './config.ts'
import { postgresDeduplicator } from './events/dedupe.ts'
import { createMessageHandler, type Routes } from './events/router.ts'
import { createDb, migrateDb } from './infra/db.ts'
import { createServer } from './infra/http.ts'
import { startConsumer, startProducer } from './infra/kafka.ts'
import { setUpAuth } from './modules/auth/index.ts'

const config = loadConfig()
const logger = pino({ level: config.LOG_LEVEL })

const routes: Routes = { activity: new Map(), platform: new Map() }

const { sql, db } = createDb(config.DATABASE_URL)
await migrateDb(db)

let accepting = false
const server = createServer({
  logger,
  isReady: async () => accepting && (await sql`select 1`).length === 1
})
await setUpAuth(server, {
  db,
  oidc: {
    issuer: new URL(config.OIDC_ISSUER),
    clientId: config.OIDC_CLIENT_ID,
    clientSecret: config.OIDC_CLIENT_SECRET,
    audience: config.OIDC_AUDIENCE
  }
})
await server.listen({ host: config.HTTP_HOST, port: config.HTTP_PORT })

const producer = await startProducer(config, logger)
const consumer = await startConsumer(
  config,
  logger,
  createMessageHandler({
    routes,
    dedupe: postgresDeduplicator(db, config.KAFKA_GROUP_ID),
    logger
  })
)
accepting = true
logger.info('twake-tasks backend started')

let stopping = false
async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true
  accepting = false
  logger.info({ signal }, 'shutting down')
  try {
    await consumer.disconnect()
    await producer.disconnect()
    await server.close()
    await sql.end({ timeout: 5 })
  } catch (error) {
    logger.error({ err: error }, 'shutdown failed')
    process.exitCode = 1
  }
}

process.once('SIGTERM', signal => void shutdown(signal))
process.once('SIGINT', signal => void shutdown(signal))
