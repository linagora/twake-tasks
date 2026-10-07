import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Changes, StreamVersions } from '../../infra/changes.ts'
import { inTenant, type Db } from '../../infra/db.ts'
import type { HttpServer } from '../../infra/http.ts'
import type { RequireIdentity } from '../auth/index.ts'
import { roleOn } from './access.ts'
import { boards } from './schema.ts'

// Sent by the boards_notify_change trigger.
export const BOARD_CHANNEL = 'board_changes'

const boardParams = z.object({ boardId: z.uuid() })

export function registerLive(
  app: HttpServer,
  deps: {
    db: Db
    requireIdentity: RequireIdentity
    changes: Changes
    streamVersions: StreamVersions
  }
) {
  app.get(
    '/boards/:boardId/events',
    { preHandler: deps.requireIdentity },
    async (request, reply) => {
      const identity = request.identity
      if (!identity) return reply.code(401).send()
      const params = boardParams.safeParse(request.params)
      if (!params.success) return reply.code(404).send({ error: 'not_found' })
      const { boardId } = params.data
      const role = await inTenant(deps.db, identity, tx =>
        roleOn(tx, identity.userId, boardId)
      )
      if (!role) return reply.code(404).send({ error: 'not_found' })

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
    }
  )
}
