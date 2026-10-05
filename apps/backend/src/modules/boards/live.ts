import { eq } from 'drizzle-orm'
import type postgres from 'postgres'
import { z } from 'zod'
import { inTenant, type Db } from '../../infra/db.ts'
import type { HttpServer } from '../../infra/http.ts'
import type { RequireIdentity } from '../auth/index.ts'
import { roleOn } from './access.ts'
import { boards } from './schema.ts'

const CHANNEL = 'board_changes'
const HEARTBEAT_MS = 25_000

type Listener = (version: number) => void

export interface BoardChanges {
  subscribe(boardId: string, listener: Listener): () => void
  close(): Promise<void>
}

// One connection per replica listens for every board, so a change made on any
// replica reaches the streams open on this one.
export async function listenToBoards(
  client: postgres.Sql
): Promise<BoardChanges> {
  const listeners = new Map<string, Set<Listener>>()
  const subscription = await client.listen(CHANNEL, payload => {
    const [boardId = '', version] = payload.split(' ')
    for (const listener of listeners.get(boardId) ?? [])
      listener(Number(version))
  })
  return {
    subscribe(boardId, listener) {
      const set = listeners.get(boardId) ?? new Set()
      listeners.set(boardId, set.add(listener))
      return () => {
        set.delete(listener)
        if (set.size === 0) listeners.delete(boardId)
      }
    },
    close: () => subscription.unlisten()
  }
}

const boardParams = z.object({ boardId: z.uuid() })

export function registerLive(
  app: HttpServer,
  deps: { db: Db; requireIdentity: RequireIdentity; changes: BoardChanges }
) {
  // Open streams would hold the server open on shutdown; clients reconnect.
  const open = new Set<() => void>()
  app.addHook('preClose', done => {
    for (const end of open) end()
    done()
  })

  app.get(
    '/boards/:boardId/events',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = boardParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const { boardId } = params.data
      const board = await inTenant(deps.db, identity, async tx => {
        if (!(await roleOn(tx, identity.userId, boardId))) return undefined
        const [row] = await tx
          .select({ version: boards.version })
          .from(boards)
          .where(eq(boards.id, boardId))
        return row
      })
      if (!board) return reply.code(404).send({ error: 'not_found' })

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
      const unsubscribe = deps.changes.subscribe(boardId, send)
      send(board.version)
      const heartbeat = setInterval(() => stream.write(':\n\n'), HEARTBEAT_MS)
      const end = () => stream.end()
      open.add(end)
      request.raw.on('close', () => {
        clearInterval(heartbeat)
        unsubscribe()
        open.delete(end)
      })
    }
  )
}
