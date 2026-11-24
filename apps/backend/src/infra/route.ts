import type {
  FastifyContextConfig,
  FastifyReply,
  FastifyRequest,
  HTTPMethods,
  onRequestHookHandler
} from 'fastify'
import { z } from 'zod'
import type { HttpServer } from './http.ts'

interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false }
}

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

// What a route needs from its caller. A board route checks it before its
// handler runs and the stores check it again inside their transaction, so a
// store that forgets its check is still covered. A read runs both in one
// transaction, so the stores' check reuses the route's.
export type Access =
  | { on: 'public' }
  | { on: 'self' }
  | {
      on: 'board'
      role: 'viewer' | 'editor' | 'admin'
      // Members of a managed project take their roles from its integration,
      // so the route refuses them whatever their role.
      refusedOnManaged?: true
      // Any member may also do it when they are the path's `:userId`.
      orSelf?: true
    }
  | { on: 'project'; role: 'viewer' | 'editor' | 'admin' }

export type BoardAccess = Extract<Access, { on: 'board' }>

export type ProjectAccess = Extract<Access, { on: 'project' }>

export type CheckBoardAccess<I> = (
  identity: I,
  params: { boardId: string; userId?: string },
  access: BoardAccess
) => Promise<'not_found' | 'forbidden' | null>

export type CheckProjectAccess<I> = (
  identity: I,
  params: { projectId: string },
  access: ProjectAccess
) => Promise<'not_found' | 'forbidden' | null>

const ACCESS_REFUSAL_STATUS = { not_found: 404, forbidden: 403 }

interface Route<I, P, Q, B, T, E extends string> {
  method: HTTPMethods
  url: string
  // A public route runs without an identity, so only a table without one
  // may declare it.
  access: null extends I ? Access : Exclude<Access, { on: 'public' }>
  params?: Schema<P>
  query?: Schema<Q>
  body?: Schema<B>
  // In bytes, for a body larger than the server's default.
  bodyLimit?: number
  status?: number
  // Compiled into a serializer, which writes only the properties it
  // declares: faster than JSON.stringify on a large answer.
  response?: z.ZodType
  onRequest?: onRequestHookHandler
  config?: FastifyContextConfig
  logSerializers?: Record<string, (value: never) => unknown>
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
    // Required by a table with a board route.
    checkBoardAccess?: CheckBoardAccess<I>
    // Required by a table with a project route.
    checkProjectAccess?: CheckProjectAccess<I>
    // Runs the access check and the handler of a read in one transaction.
    shareTransaction?: <T>(identity: I, work: () => Promise<T>) => Promise<T>
  },
  routes: readonly DeclaredRoute<I, E>[]
) {
  for (const route of routes) {
    const open = route.access.on === 'public'
    const checkAccess =
      boardAccessCheck(route, deps.checkBoardAccess) ??
      projectAccessCheck(route, deps.checkProjectAccess)
    // A stream would hold its transaction open for as long as it lasts.
    const share =
      checkAccess && route.method === 'GET' && !route.config?.stream
        ? deps.shareTransaction
        : undefined
    const status = route.status ?? 200
    app.route({
      method: route.method,
      url: route.url,
      ...(route.onRequest && { onRequest: route.onRequest }),
      ...(route.config && { config: route.config }),
      ...(route.logSerializers && { logSerializers: route.logSerializers }),
      ...(route.bodyLimit && { bodyLimit: route.bodyLimit }),
      ...(route.response && {
        schema: { response: { [status]: serializedAs(route.response) } }
      }),
      ...(!open && { preHandler: deps.requireIdentity }),
      handler: async (request, reply) => {
        const identity = deps.identify(request)
        if (!identity && !open) return reply.code(401).send()
        const params = parse(route.params, request.params)
        if (!params.success) return reply.code(404).send({ error: 'not_found' })
        const answer = async () => {
          const refused = await checkAccess?.(identity as I, params.data)
          if (refused) {
            return { status: ACCESS_REFUSAL_STATUS[refused], error: refused }
          }
          const query = parse(route.query, request.query)
          const body = parse(route.body, request.body)
          if (!query.success || !body.success) {
            return { status: 400, error: 'invalid_request' }
          }
          return route.handler({
            // Null only on a public route, whose table has a null identity.
            identity: identity as I,
            params: params.data,
            query: query.data,
            body: body.data,
            http: { request, reply }
          })
        }
        const result = await (share ? share(identity as I, answer) : answer())
        // A stream has taken the reply over.
        if (reply.sent) return reply
        if ('status' in result) {
          return reply.code(result.status).send({ error: result.error })
        }
        if (!result.ok) {
          const refused: number = deps.refusalStatus[result.error]
          return reply.code(refused).send({ error: result.error })
        }
        return reply
          .code(status)
          .send(status === 204 ? undefined : result.value)
      }
    })
  }
}

function boardAccessCheck<I>(
  route: DeclaredRoute<I, string>,
  check: CheckBoardAccess<I> | undefined
) {
  const { access } = route
  if (access.on !== 'board') return null
  if (!check || !route.url.includes(':boardId')) {
    throw new Error(
      `${route.method} ${route.url} needs a board in its path and a board access check`
    )
  }
  return (identity: I, params: unknown) =>
    check(identity, params as { boardId: string; userId?: string }, access)
}

function projectAccessCheck<I>(
  route: DeclaredRoute<I, string>,
  check: CheckProjectAccess<I> | undefined
) {
  const { access } = route
  if (access.on !== 'project') return null
  if (!check || !route.url.includes(':projectId')) {
    throw new Error(
      `${route.method} ${route.url} needs a project in its path and a project access check`
    )
  }
  return (identity: I, params: unknown) =>
    check(identity, params as { projectId: string }, access)
}

// The serializer picks a union branch by validating the value, so a closed
// object would refuse extra properties it drops anyway. OpenAPI's `nullable`
// tests for null without that validation, but the serializer refuses it on a
// union (no `type`), so there null becomes the first branch.
function serializedAs(schema: z.ZodType) {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: 'output',
    override: ({ jsonSchema }) => {
      if (jsonSchema.additionalProperties === false) {
        delete jsonSchema.additionalProperties
      }
      const branches = jsonSchema.anyOf ?? jsonSchema.oneOf
      if (!jsonSchema.nullable || !branches) return
      delete jsonSchema.nullable
      branches.unshift({ type: 'null' })
    }
  })
}

function parse(schema: Schema<unknown> | undefined, value: unknown) {
  return schema
    ? schema.safeParse(value)
    : { success: true as const, data: undefined }
}
