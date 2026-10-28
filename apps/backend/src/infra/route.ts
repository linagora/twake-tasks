import type { FastifyReply, FastifyRequest, HTTPMethods } from 'fastify'
import type { HttpServer } from './http.ts'

interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false }
}

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

interface Route<I, P, Q, B, T, E extends string> {
  method: HTTPMethods
  url: string
  params?: Schema<P>
  query?: Schema<Q>
  body?: Schema<B>
  status?: number
  handler: (request: {
    identity: I
    params: P
    query: Q
    body: B
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
    app.route({
      method: route.method,
      url: route.url,
      preHandler: deps.requireIdentity,
      handler: async (request, reply) => {
        const identity = deps.identify(request)
        if (!identity) return reply.code(401).send()
        const params = parse(route.params, request.params)
        if (!params.success) return reply.code(404).send({ error: 'not_found' })
        const query = parse(route.query, request.query)
        const body = parse(route.body, request.body)
        if (!query.success || !body.success) {
          return reply.code(400).send({ error: 'invalid_request' })
        }
        const result = await route.handler({
          identity,
          params: params.data,
          query: query.data,
          body: body.data
        })
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
