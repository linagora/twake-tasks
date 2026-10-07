import { eq } from 'drizzle-orm'
import type postgres from 'postgres'
import { z } from 'zod'
import {
  listenToChanges,
  type Changes,
  type StreamVersions
} from '../../infra/changes.ts'
import { inTenant, type Db } from '../../infra/db.ts'
import type { HttpServer } from '../../infra/http.ts'
import type { RequireIdentity } from '../auth/index.ts'
import { roleOn } from './access.ts'
import { boards } from './schema.ts'

export type BoardChanges = Changes

export const listenToBoards = (client: postgres.Sql): Promise<BoardChanges> =>
  listenToChanges(client, 'board_changes')

const boardParams = z.object({ boardId: z.uuid() })

export function registerLive(
  app: HttpServer,
  deps: {
    db: Db
    requireIdentity: RequireIdentity
    changes: BoardChanges
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
      const board = await inTenant(deps.db, identity, async tx => {
        if (!(await roleOn(tx, identity.userId, boardId))) return undefined
        const [row] = await tx
          .select({ version: boards.version })
          .from(boards)
          .where(eq(boards.id, boardId))
        return row
      })
      if (!board) return reply.code(404).send({ error: 'not_found' })

      deps.streamVersions(request, reply, {
        changes: deps.changes,
        key: boardId,
        version: board.version
      })
    }
  )
}
