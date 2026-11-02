import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createServer } from './http.ts'
import { defineRoute, registerRoutes } from './route.ts'

type RequireIdentity = Parameters<typeof registerRoutes>[1]['requireIdentity']

interface Person {
  userId: string
}

const alice: Person = { userId: 'alice-id' }

const signedIn: RequireIdentity = () => Promise.resolve(undefined)

const refusalStatus = { not_found: 404, taken: 409 } as const

function serverWith(
  requireIdentity: RequireIdentity,
  identity: Person | null = alice
) {
  const app = createServer({
    logger: pino({ level: 'silent' }),
    isReady: () => Promise.resolve(true)
  })
  const identify = (): Person | null => identity
  registerRoutes(app, { requireIdentity, identify, refusalStatus }, [
    defineRoute({
      method: 'POST',
      url: '/things/:thingId',
      access: { on: 'self' },
      params: z.object({ thingId: z.uuid() }),
      query: z.object({ dry: z.enum(['yes', 'no']).default('no') }),
      body: z.object({ name: z.string().min(1) }),
      status: 201,
      handler: ({ identity, params, query, body }) =>
        Promise.resolve(
          body.name === 'taken'
            ? { ok: false, error: 'taken' }
            : {
                ok: true,
                value: {
                  by: identity.userId,
                  thingId: params.thingId,
                  dry: query.dry,
                  name: body.name
                }
              }
        )
    }),
    defineRoute({
      method: 'GET',
      url: '/things',
      access: { on: 'self' },
      handler: () => Promise.resolve({ ok: true, value: { things: [] } })
    }),
    defineRoute({
      method: 'DELETE',
      url: '/things',
      access: { on: 'self' },
      status: 204,
      handler: () => Promise.resolve({ ok: true, value: null })
    })
  ])
  registerRoutes(
    app,
    { requireIdentity, identify: () => null, refusalStatus },
    [
      defineRoute({
        method: 'GET',
        url: '/open',
        access: { on: 'public' },
        handler: () => Promise.resolve({ ok: true, value: { open: true } })
      })
    ]
  )
  return app
}

const thingId = '0b0d4c5e-8f4a-4c1e-9b7e-2f5d1c3a4b6d'

describe('a declared route', () => {
  it('hands the parsed request to its handler and sends the declared status', async () => {
    const response = await serverWith(signedIn).inject({
      method: 'POST',
      url: `/things/${thingId}?dry=yes`,
      body: { name: 'lamp' }
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({
      by: 'alice-id',
      thingId,
      dry: 'yes',
      name: 'lamp'
    })
  })

  it('answers 200 when it declares no status', async () => {
    const response = await serverWith(signedIn).inject('/things')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ things: [] })
  })

  it('answers 204 without a body', async () => {
    const response = await serverWith(signedIn).inject({
      method: 'DELETE',
      url: '/things'
    })

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
  })

  it('answers 404 on params it cannot parse, before reading the body', async () => {
    const response = await serverWith(signedIn).inject({
      method: 'POST',
      url: '/things/not-an-id',
      body: {}
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'not_found' })
  })

  it.each([
    ['body', `/things/${thingId}`, { name: '' }],
    ['query', `/things/${thingId}?dry=maybe`, { name: 'lamp' }]
  ])('answers 400 on a %s it cannot parse', async (_part, url, body) => {
    const response = await serverWith(signedIn).inject({
      method: 'POST',
      url,
      body
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'invalid_request' })
  })

  it('answers a refusal with its status', async () => {
    const response = await serverWith(signedIn).inject({
      method: 'POST',
      url: `/things/${thingId}`,
      body: { name: 'taken' }
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: 'taken' })
  })

  it('lets the identity check answer first', async () => {
    const response = await serverWith(async (_request, reply) =>
      reply.code(401).send()
    ).inject('/things')

    expect(response.statusCode).toBe(401)
  })

  it('answers 401 when no identity was set', async () => {
    const response = await serverWith(signedIn, null).inject('/things')

    expect(response.statusCode).toBe(401)
  })

  it('answers a public route without checking the identity', async () => {
    const response = await serverWith(
      async (_request, reply) => reply.code(401).send(),
      null
    ).inject('/open')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ open: true })
  })
})

const boardId = '6a1f3c2e-4b5d-4e7f-8a9b-0c1d2e3f4a5b'

function boardServer(role: 'viewer' | 'editor' | null, managed = false) {
  const app = createServer({
    logger: pino({ level: 'silent' }),
    isReady: () => Promise.resolve(true)
  })
  const reached: string[] = []
  const rank = { viewer: 0, editor: 1, admin: 2 }
  registerRoutes(
    app,
    {
      requireIdentity: signedIn,
      identify: () => alice,
      refusalStatus,
      checkBoardAccess: (_identity, _params, access) =>
        Promise.resolve(
          !role
            ? 'not_found'
            : rank[role] < rank[access.role] ||
                (managed && access.refusedOnManaged)
              ? 'forbidden'
              : null
        )
    },
    [
      defineRoute({
        method: 'PATCH',
        url: '/boards/:boardId',
        access: { on: 'board', role: 'editor' },
        params: z.object({ boardId: z.uuid() }),
        handler: ({ params }) => {
          reached.push(params.boardId)
          return Promise.resolve({ ok: true, value: { renamed: true } })
        }
      }),
      defineRoute({
        method: 'GET',
        url: '/boards/:boardId/sharing',
        access: { on: 'board', role: 'viewer', refusedOnManaged: true },
        params: z.object({ boardId: z.uuid() }),
        handler: () => Promise.resolve({ ok: true, value: { people: [] } })
      })
    ]
  )
  return { app, reached }
}

describe('a route on a board', () => {
  it('answers 404 to someone not on the board without running its handler', async () => {
    const { app, reached } = boardServer(null)

    const response = await app.inject({
      method: 'PATCH',
      url: `/boards/${boardId}`
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'not_found' })
    expect(reached).toEqual([])
  })

  it('answers 403 to a member below the declared role without running its handler', async () => {
    const { app, reached } = boardServer('viewer')

    const response = await app.inject({
      method: 'PATCH',
      url: `/boards/${boardId}`
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })
    expect(reached).toEqual([])
  })

  it('answers 403 on a managed project when the route refuses one', async () => {
    const { app } = boardServer('editor', true)

    const response = await app.inject(`/boards/${boardId}/sharing`)

    expect(response.statusCode).toBe(403)
  })

  it('runs its handler for a member with the declared role', async () => {
    const { app, reached } = boardServer('editor')

    const response = await app.inject({
      method: 'PATCH',
      url: `/boards/${boardId}`
    })

    expect(response.statusCode).toBe(200)
    expect(reached).toEqual([boardId])
  })

  it.each([
    ['without a board access check', '/boards/:boardId', undefined],
    ['without a board in its path', '/boards', () => Promise.resolve(null)]
  ])('cannot be registered %s', (_case, url, checkBoardAccess) => {
    const app = createServer({
      logger: pino({ level: 'silent' }),
      isReady: () => Promise.resolve(true)
    })
    const register = () => {
      registerRoutes(
        app,
        {
          requireIdentity: signedIn,
          identify: () => alice,
          refusalStatus,
          ...(checkBoardAccess && { checkBoardAccess })
        },
        [
          defineRoute({
            method: 'GET',
            url,
            access: { on: 'board', role: 'viewer' },
            handler: () => Promise.resolve({ ok: true, value: {} })
          })
        ]
      )
    }

    expect(register).toThrow(`GET ${url} needs a board`)
  })
})
