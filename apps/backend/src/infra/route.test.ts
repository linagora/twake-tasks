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
      handler: () => Promise.resolve({ ok: true, value: { things: [] } })
    }),
    defineRoute({
      method: 'DELETE',
      url: '/things',
      status: 204,
      handler: () => Promise.resolve({ ok: true, value: null })
    })
  ])
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
})
