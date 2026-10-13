import type { FastifyReply, FastifyRequest } from 'fastify'
import type { HttpServer } from './http.ts'

const HEARTBEAT_MS = 25_000

type Listener = (version: number) => void

export interface Changes {
  subscribe(key: string, listener: Listener): () => void
  emit(key: string, version: number): void
}

/** The streams open on this replica, by key. */
export function createChanges(): Changes {
  const listeners = new Map<string, Set<Listener>>()
  return {
    subscribe(key, listener) {
      const set = listeners.get(key) ?? new Set()
      listeners.set(key, set.add(listener))
      return () => {
        set.delete(listener)
        if (set.size === 0) listeners.delete(key)
      }
    },
    emit(key, version) {
      for (const listener of listeners.get(key) ?? []) listener(version)
    }
  }
}

export type StreamVersions = (
  request: FastifyRequest,
  reply: FastifyReply,
  stream: { changes: Changes; key: string; current: () => Promise<number> }
) => Promise<void>

/** Streams a version as server-sent events: the current one, then each new one. */
export function versionStreams(app: HttpServer): StreamVersions {
  // Open streams would hold the server open on shutdown; clients reconnect.
  const open = new Set<() => void>()
  app.addHook('preClose', done => {
    for (const end of open) end()
    done()
  })

  return async (request, reply, { changes, key, current }) => {
    reply.hijack()
    const stream = reply.raw
    stream.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no'
    })
    const send = (version: number) => {
      stream.write(
        `id: ${String(version)}\ndata: ${JSON.stringify({ version })}\n\n`
      )
    }
    // Subscribed before reading, so a change committed in between still arrives.
    const unsubscribe = changes.subscribe(key, send)
    const heartbeat = setInterval(() => stream.write(':\n\n'), HEARTBEAT_MS)
    const end = () => stream.end()
    open.add(end)
    request.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
      open.delete(end)
    })
    try {
      send(await current())
    } catch (error) {
      request.log.error({ err: error }, 'stream version unreadable')
      end()
    }
  }
}
