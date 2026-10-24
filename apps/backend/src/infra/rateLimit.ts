import rateLimit from '@fastify/rate-limit'
import { Redis } from 'ioredis'
import type { Logger } from 'pino'
import type { HttpServer } from './http.ts'

// A Redis outage lets every request through rather than refusing them all.
export function connectRedis(url: string, logger: Logger): Redis {
  const redis = new Redis(url, {
    commandTimeout: 500,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  })
  // ioredis reports every failed reconnection, so only the first is logged.
  let up = true
  redis.on('ready', () => {
    if (!up) logger.info('redis back, rate limits are on')
    up = true
  })
  redis.on('error', (error: Error) => {
    if (up) {
      logger.warn({ err: error }, 'redis unavailable, rate limits are off')
    }
    up = false
  })
  return redis
}

export async function registerRateLimit(
  app: HttpServer,
  redis?: Redis
): Promise<void> {
  await app.register(rateLimit, {
    global: false,
    skipOnError: true,
    ...(redis && { redis, nameSpace: 'twake-tasks:rate-limit:' })
  })
}
