import Fastify, {
  LogController,
  type FastifyBaseLogger,
  type FastifyError,
  type FastifyInstance,
  type FastifyRequest
} from 'fastify'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { isTransient } from './db.ts'
import type { Metrics } from './metrics.ts'
import { runInRequest } from './requestId.ts'

declare module 'fastify' {
  interface FastifyContextConfig {
    // A stream lasts as long as its tab: its duration says nothing of latency.
    stream?: boolean
  }
}

export function createServer(deps: {
  logger: FastifyBaseLogger
  isReady: () => Promise<boolean>
  // The proxies between the caller and the server, each adding the address
  // it got the request from to X-Forwarded-For.
  proxyHops?: number | undefined
  metrics?: Metrics | undefined
}): HttpServer {
  const proxyHops = deps.proxyHops ?? 0
  const app = Fastify({
    loggerInstance: deps.logger,
    trustProxy: (_address, hop) => hop < proxyHops,
    // Only a uuid is taken from the caller, since the id ends up in events
    // and in a uuid column.
    genReqId: request => {
      const sent = request.headers['x-request-id']
      return typeof sent === 'string' && uuid.safeParse(sent).success
        ? sent.toLowerCase()
        : randomUUID()
    },
    logController: new LogController({
      disableRequestLogging: request => isProbe(request.url)
    })
  })

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })

  // Not in onRequest: the body is parsed afterwards, outside its async context.
  app.addHook('preHandler', (request, _reply, done) => {
    runInRequest(request.id, done)
  })

  // Fastify answers with the error's message, which for a failed query holds
  // its SQL and parameters.
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const status =
      error.statusCode !== undefined && error.statusCode >= 400
        ? error.statusCode
        : 500
    if (status < 500) return reply.send(error)
    // Such as a query cut off by a timeout while the database is busy.
    const unavailable = isTransient(error)
    reply.code(unavailable ? 503 : status)
    reply.log.error({ req: request, res: reply, err: error }, error.message)
    return reply.send({ error: unavailable ? 'unavailable' : 'server_error' })
  })

  // Postgres text and jsonb cannot hold U+0000: a query would fail with it.
  app.addHook('preValidation', async (request, reply) => {
    if (holdsNul(request.body) || holdsNul(request.query)) {
      return reply.code(400).send({ error: 'invalid_request' })
    }
  })

  app.get('/health/live', () => ({ status: 'ok' }))

  app.get('/health/ready', async (_request, reply) => {
    const ready = await deps.isReady().catch(() => false)
    return reply
      .code(ready ? 200 : 503)
      .send({ status: ready ? 'ok' : 'unavailable' })
  })

  const metrics = deps.metrics
  if (metrics) {
    const labels = (request: FastifyRequest) => ({
      method: request.method,
      route: request.routeOptions.url ?? 'unmatched'
    })
    // A stream hijacks its reply, and a caller that leaves closes it without
    // the 'finish' that onResponse waits for.
    app.addHook('onRequest', async (request, reply) => {
      if (!request.routeOptions.config.stream) return
      reply.raw.once('close', () => {
        metrics.httpRequests.inc({
          ...labels(request),
          status: reply.statusCode
        })
      })
    })
    app.addHook('onResponse', async (request, reply) => {
      if (request.routeOptions.config.stream || isProbe(request.url)) return
      metrics.httpRequests.inc({ ...labels(request), status: reply.statusCode })
      metrics.httpRequestDuration.observe(
        labels(request),
        reply.elapsedTime / 1000
      )
    })

    app.get('/metrics', async (_request, reply) =>
      reply
        .type(metrics.registry.contentType)
        .send(await metrics.registry.metrics())
    )
  }

  return app
}

const uuid = z.uuid()

const isProbe = (url: string) =>
  url.startsWith('/health/') || url === '/metrics'

// A loop, not recursion: a deeply nested body would overflow the stack.
function holdsNul(value: unknown): boolean {
  const pending = [value]
  while (pending.length > 0) {
    const next = pending.pop()
    if (typeof next === 'string' && next.includes('\0')) return true
    if (typeof next !== 'object' || next === null) continue
    for (const [key, entry] of Object.entries(next)) {
      if (key.includes('\0')) return true
      pending.push(entry)
    }
  }
  return false
}

export type HttpServer = FastifyInstance
