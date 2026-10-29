import { eq } from 'drizzle-orm'
import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Changes, StreamVersions } from '../../infra/changes.ts'
import { inTenant, type Db } from '../../infra/db.ts'
import type { HttpServer } from '../../infra/http.ts'
import type { Metrics } from '../../infra/metrics.ts'
import {
  defineRoute,
  registerRoutes,
  type DeclaredRoute
} from '../../infra/route.ts'
import type { Identity, RequireIdentity } from '../auth/index.ts'
import { claimInvites, roleOn } from './access.ts'
import { boards } from './schema.ts'

const boardParams = z.object({ boardId: z.uuid() })

// Only a hint: a stream frees its place whenever its tab closes.
const STREAM_RETRY_AFTER_SECONDS = 30

export function registerLive(
  app: HttpServer,
  deps: {
    db: Db
    requireIdentity: RequireIdentity
    changes: Changes
    streamVersions: StreamVersions
    // Per user on this replica, where the streams live; 0 turns the cap off.
    openStreams?: number | undefined
    metrics?: Metrics | undefined
  }
) {
  const maxOpen = deps.openStreams ?? 0
  const openBy = new Map<string, number>()

  const routes: DeclaredRoute<Identity, 'not_found' | 'too_many_requests'>[] = [
    defineRoute({
      method: 'GET',
      url: '/boards/:boardId/events',
      access: { on: 'board', role: 'viewer' },
      config: { stream: true },
      params: boardParams,
      handler: async ({ identity, params, http: { request, reply } }) => {
        const { boardId } = params
        const { userId } = identity
        const open = openBy.get(userId) ?? 0
        if (maxOpen > 0 && open >= maxOpen) {
          reply.header('retry-after', STREAM_RETRY_AFTER_SECONDS)
          return { ok: false, error: 'too_many_requests' }
        }
        openBy.set(userId, open + 1)
        reply.raw.once('close', () => {
          const left = (openBy.get(userId) ?? 1) - 1
          if (left > 0) openBy.set(userId, left)
          else openBy.delete(userId)
        })
        // Before any await: a caller gone meanwhile closes without a listener.
        const streams = deps.metrics?.liveStreamsOpen
        streams?.inc()
        reply.raw.once('close', () => streams?.dec())
        const role = await inTenant(deps.db, identity, async tx => {
          await claimInvites(tx)
          return roleOn(tx, identity.userId, boardId)
        })
        if (!role) return { ok: false, error: 'not_found' }

        await deps.streamVersions(request, reply, {
          changes: deps.changes,
          key: boardId,
          current: () =>
            inTenant(deps.db, identity, async tx => {
              const [row] = await tx
                .select({ version: boards.version })
                .from(boards)
                .where(eq(boards.id, boardId))
              if (!row) throw new Error(`board ${boardId} is gone`)
              return row.version
            })
        })
        return { ok: true, value: undefined }
      }
    })
  ]
  registerRoutes(
    app,
    {
      requireIdentity: deps.requireIdentity,
      identify: (request: FastifyRequest) => request.identity,
      refusalStatus: { not_found: 404, too_many_requests: 429 }
    },
    routes
  )
  return routes
}
