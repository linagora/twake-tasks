import Fastify, {
  LogController,
  type FastifyBaseLogger,
  type FastifyError,
  type FastifyInstance
} from 'fastify'
import { isTransient } from './db.ts'

export function createServer(deps: {
  logger: FastifyBaseLogger
  isReady: () => Promise<boolean>
  // The proxies between the caller and the server, each adding the address
  // it got the request from to X-Forwarded-For.
  proxyHops?: number | undefined
}): HttpServer {
  const proxyHops = deps.proxyHops ?? 0
  const app = Fastify({
    loggerInstance: deps.logger,
    trustProxy: (_address, hop) => hop < proxyHops,
    logController: new LogController({
      disableRequestLogging: request => request.url.startsWith('/health/')
    })
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

  return app
}

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
