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
  redis.on('error', (error: Error) => {
    logger.warn({ err: error }, 'redis unavailable, rate limits are off')
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
