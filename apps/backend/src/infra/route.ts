import type {
  FastifyContextConfig,
  FastifyReply,
  FastifyRequest,
  HTTPMethods,
  onRequestHookHandler
} from 'fastify'
import type { HttpServer } from './http.ts'

interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false }
}

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

// What a route needs from its caller. The stores enforce it inside their
// transaction; the declaration is what the permission tests hold them to.
export type Access =
  | { on: 'public' }
  | { on: 'self' }
  | {
      on: 'board'
      role: 'viewer' | 'editor' | 'admin'
      // Members of a managed project take their roles from its integration,
      // so the route refuses them whatever their role.
      refusedOnManaged?: true
    }

interface Route<I, P, Q, B, T, E extends string> {
  method: HTTPMethods
  url: string
  // A public route runs without an identity, so only a table without one
  // may declare it.
  access: null extends I ? Access : Exclude<Access, { on: 'public' }>
  params?: Schema<P>
  query?: Schema<Q>
  body?: Schema<B>
  status?: number
  onRequest?: onRequestHookHandler
  config?: FastifyContextConfig
  handler: (request: {
    identity: I
    params: P
    query: Q
    body: B
    // For a route that answers with more than a status and a body, such as
    // a stream or a header.
    http: { request: FastifyRequest; reply: FastifyReply }
  }) => Promise<Result<T, E>>
}

export type DeclaredRoute<I, E extends string> = Route<
  I,
  unknown,
  unknown,
  unknown,
  unknown,
  E
>

export function defineRoute<
  I,
  E extends string,
  T,
  P = undefined,
  Q = undefined,
  B = undefined
>(route: Route<I, P, Q, B, T, E>): DeclaredRoute<I, E> {
  return route as DeclaredRoute<I, E>
}

export function registerRoutes<I, E extends string>(
  app: HttpServer,
  deps: {
    requireIdentity: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<FastifyReply | undefined>
    identify: (request: FastifyRequest) => I | null
    refusalStatus: Readonly<Record<E, number>>
  },
  routes: readonly DeclaredRoute<I, E>[]
) {
  for (const route of routes) {
    const open = route.access.on === 'public'
    app.route({
      method: route.method,
      url: route.url,
      ...(route.onRequest && { onRequest: route.onRequest }),
      ...(route.config && { config: route.config }),
      ...(!open && { preHandler: deps.requireIdentity }),
      handler: async (request, reply) => {
        const identity = deps.identify(request)
        if (!identity && !open) return reply.code(401).send()
        const params = parse(route.params, request.params)
        if (!params.success) return reply.code(404).send({ error: 'not_found' })
        const query = parse(route.query, request.query)
        const body = parse(route.body, request.body)
        if (!query.success || !body.success) {
          return reply.code(400).send({ error: 'invalid_request' })
        }
        const result = await route.handler({
          // Null only on a public route, whose table has a null identity.
          identity: identity as I,
          params: params.data,
          query: query.data,
          body: body.data,
          http: { request, reply }
        })
        // A stream has taken the reply over.
        if (reply.sent) return reply
        if (!result.ok) {
          const refused: number = deps.refusalStatus[result.error]
          return reply.code(refused).send({ error: result.error })
        }
        const status = route.status ?? 200
        return reply
          .code(status)
          .send(status === 204 ? undefined : result.value)
      }
    })
  }
}

function parse(schema: Schema<unknown> | undefined, value: unknown) {
  return schema
    ? schema.safeParse(value)
    : { success: true as const, data: undefined }
}
