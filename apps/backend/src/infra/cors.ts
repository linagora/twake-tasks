import type { onRequestHookHandler } from 'fastify'
import type { HttpServer } from './http.ts'

// The token travels in the Authorization header, never in a cookie, so
// credentials stay off.
export function allowOrigins(
  app: HttpServer,
  url: string,
  origins: readonly string[]
): onRequestHookHandler {
  const allowed = new Set(origins)
  const allowedOrigin = (origin: string | undefined) =>
    origin !== undefined && allowed.has(origin) ? origin : null

  const onRequest: onRequestHookHandler = (request, reply, done) => {
    reply.header('vary', 'Origin')
    const origin = allowedOrigin(request.headers.origin)
    if (origin) reply.header('access-control-allow-origin', origin)
    done()
  }

  app.options(url, { onRequest }, (request, reply) => {
    if (allowedOrigin(request.headers.origin)) {
      reply.headers({
        'access-control-allow-methods': 'GET',
        'access-control-allow-headers': 'Authorization',
        'access-control-max-age': '600'
      })
    }
    return reply.code(204).send()
  })

  return onRequest
}
