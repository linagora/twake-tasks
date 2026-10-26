import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import { createServer } from './http.ts'
import { createMetrics } from './metrics.ts'

interface LogLine {
  level: number
  msg?: string
}

function serverLoggingTo(lines: LogLine[]) {
  return createServer({
    logger: pino(
      {},
      {
        write: (line: string) => {
          lines.push(JSON.parse(line) as LogLine)
        }
      }
    ),
    isReady: () => Promise.resolve(true)
  })
}

describe('the server', () => {
  it.each([
    [2, '198.51.100.1'],
    [0, '10.0.0.3']
  ])(
    'behind %i trusted proxies, takes the caller to be %s',
    async (proxyHops, ip) => {
      const app = createServer({
        logger: pino({ level: 'silent' }),
        isReady: () => Promise.resolve(true),
        proxyHops
      })
      app.get('/ip', request => ({ ip: request.ip }))

      // The caller forged the first address; the ingress added the second
      // and the frontend's nginx the third, before connecting.
      const response = await app.inject({
        url: '/ip',
        remoteAddress: '10.0.0.3',
        headers: { 'x-forwarded-for': '192.0.2.66, 198.51.100.1, 10.0.0.2' }
      })

      expect(response.json()).toEqual({ ip })
    }
  )

  it('answers a failure without its cause, which goes to the log', async () => {
    const lines: LogLine[] = []
    const app = serverLoggingTo(lines)
    app.get('/fails', () => {
      throw new Error('Failed query: select title from tasks')
    })

    const response = await app.inject('/fails')

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ error: 'server_error' })
    expect(
      lines.filter(line => line.level >= 50).map(line => line.msg)
    ).toEqual(['Failed query: select title from tasks'])
  })

  it('answers a query cut off by a timeout as unavailable, and logs it', async () => {
    const lines: LogLine[] = []
    const app = serverLoggingTo(lines)
    app.get('/slow', () => {
      throw new Error('Failed query: select title from tasks', {
        cause: Object.assign(
          new Error('canceling statement due to statement timeout'),
          { name: 'PostgresError', code: '57014' }
        )
      })
    })

    const response = await app.inject('/slow')

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ error: 'unavailable' })
    expect(
      lines.filter(line => line.level >= 50).map(line => line.msg)
    ).toEqual(['Failed query: select title from tasks'])
  })

  it('still says what is wrong with a request it cannot read', async () => {
    const app = serverLoggingTo([])
    app.post('/echo', request => request.body)

    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{'
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      code: 'FST_ERR_CTP_INVALID_JSON_BODY'
    })
  })

  it('reads a deeply nested body without overflowing', async () => {
    const app = serverLoggingTo([])
    app.post('/echo', () => ({ ok: true }))
    const depth = 200_000

    const responses = await Promise.all(
      ['"x"', '"\\u0000"'].map(leaf =>
        app.inject({
          method: 'POST',
          url: '/echo',
          headers: { 'content-type': 'application/json' },
          payload: '['.repeat(depth) + leaf + ']'.repeat(depth)
        })
      )
    )

    expect(responses.map(response => response.statusCode)).toEqual([200, 400])
  })

  it('labels a request with its route, never its URL', async () => {
    const metrics = createMetrics()
    const app = createServer({
      logger: pino({ level: 'silent' }),
      isReady: () => Promise.resolve(true),
      metrics
    })
    app.get('/boards/:boardId', () => ({ ok: true }))

    await app.inject('/boards/b-42')
    await app.inject('/nowhere/b-42')
    const scraped = await app.inject('/metrics')

    expect(scraped.body).toContain(
      'http_requests_total{method="GET",route="/boards/:boardId",status="200"} 1'
    )
    expect(scraped.body).toContain(
      'http_requests_total{method="GET",route="unmatched",status="404"} 1'
    )
    expect(scraped.body).toContain(
      'http_request_duration_seconds_count{method="GET",route="/boards/:boardId"} 1'
    )
    expect(scraped.body).not.toContain('b-42')
  })

  it('counts a stream, but leaves it out of the request durations', async () => {
    const metrics = createMetrics()
    const app = createServer({
      logger: pino({ level: 'silent' }),
      isReady: () => Promise.resolve(true),
      metrics
    })
    app.get('/events', { config: { stream: true } }, () => ({ ok: true }))

    await app.inject('/events')
    const scraped = await app.inject('/metrics')

    expect(scraped.body).toContain(
      'http_requests_total{method="GET",route="/events",status="200"} 1'
    )
    expect(scraped.body).not.toContain('route="/events"}')
  })

  it('serves no metrics when they are off', async () => {
    const response = await serverLoggingTo([]).inject('/metrics')

    expect(response.statusCode).toBe(404)
  })
})
