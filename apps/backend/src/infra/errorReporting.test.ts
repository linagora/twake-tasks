import * as Sentry from '@sentry/node'
import { pino } from 'pino'
import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from './http.ts'
import { startErrorReporting } from './errorReporting.ts'

interface SentEvent {
  message?: string
  level?: string
  release?: string
  tags?: Record<string, string>
  contexts?: Record<string, unknown>
  request?: unknown
  user?: unknown
  exception?: { values?: { type?: string; value?: string }[] }
}

function reportingTo(events: SentEvent[]) {
  return startErrorReporting({
    dsn: 'https://key@sentry.example.com/1',
    environment: 'test',
    release: '1.2.3',
    transport: options =>
      Sentry.createTransport(options, request => {
        // An envelope: its header, then an item header and its payload.
        const [, , payload] = String(request.body).split('\n')
        if (payload) events.push(JSON.parse(payload) as SentEvent)
        return Promise.resolve({ statusCode: 200 })
      })
  })
}

const silent = () => pino({}, { write: () => undefined })

describe('error reporting', () => {
  let stop: (() => Promise<void>) | undefined
  afterEach(async () => {
    await stop?.()
    stop = undefined
  })

  it('reports an error log as one event, with the app and the release', async () => {
    const events: SentEvent[] = []
    stop = reportingTo(events)

    silent()
      .child({ kind: 'reminder' })
      .error({ job: 'b8f0c1e4', attempts: 5 }, 'job dropped')
    await Sentry.flush(2000)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      message: 'job dropped',
      level: 'error',
      release: '1.2.3',
      tags: { app: 'twake-tasks-backend' },
      contexts: { pino: { msg: 'job dropped', kind: 'reminder' } }
    })
    expect(events[0]?.contexts?.pino).not.toHaveProperty('job')
  })

  it('reports nothing below the error level', async () => {
    const events: SentEvent[] = []
    stop = reportingTo(events)

    const logger = silent()
    logger.warn({ err: new Error('busy') }, 'relay failed')
    logger.info('event handled')
    await Sentry.flush(2000)

    expect(events).toEqual([])
  })

  it('reports a failed query without its parameters or an address', async () => {
    const events: SentEvent[] = []
    stop = reportingTo(events)

    const cause = new Error('connection to ada@example.com refused')
    const error = new Error(
      'Failed query: insert into tasks (title) values ($1)\nparams: Call ada@example.com',
      { cause }
    )
    silent().error({ err: error }, 'relay run failed')
    await Sentry.flush(2000)

    const values = events[0]?.exception?.values?.map(value => value.value)
    expect(values).toEqual([
      'connection to [email] refused',
      'Failed query: insert into tasks (title) values ($1)'
    ])
  })

  it('reports a thrown object that is not an Error without its fields', async () => {
    const events: SentEvent[] = []
    stop = reportingTo(events)

    silent().error({ err: { title: 'Call Ada' } }, 'relay run failed')
    await Sentry.flush(2000)

    expect(events).toHaveLength(1)
    expect(JSON.stringify(events[0])).not.toMatch(/Ada/)
  })

  it('reports a server error without the request, its query or its caller', async () => {
    const events: SentEvent[] = []
    stop = reportingTo(events)
    const app = createServer({
      logger: silent(),
      isReady: () => Promise.resolve(true)
    })
    app.post('/api/boom', () => {
      throw new Error('boom')
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/boom?q=secret',
      headers: { authorization: 'Bearer token', cookie: 'session=1' },
      payload: { title: 'Call Ada' }
    })
    await Sentry.flush(2000)

    expect(response.statusCode).toBe(500)
    expect(events).toHaveLength(1)
    const event = events[0]
    expect(event?.exception?.values?.[0]?.value).toBe('boom')
    expect(event?.request).toBeUndefined()
    expect(event?.user).toBeUndefined()
    expect(event?.contexts?.pino).toEqual({ msg: 'boom' })
    expect(JSON.stringify(event)).not.toMatch(/secret|Bearer|session|Ada/)
  })
})
