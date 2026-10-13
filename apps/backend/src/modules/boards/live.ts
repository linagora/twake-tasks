import type { RabbitMQClient } from '@linagora/rabbitmq-client'
import { eq } from 'drizzle-orm'
import type { Logger } from 'pino'
import { z } from 'zod'
import type { Changes, StreamVersions } from '../../infra/changes.ts'
import { afterCommit, inTenant, type Db, type Tx } from '../../infra/db.ts'
import type { HttpServer } from '../../infra/http.ts'
import type { RequireIdentity } from '../auth/index.ts'
import { claimInvites, roleOn } from './access.ts'
import { boards } from './schema.ts'

const BOARD_CHANGED = 'board.changed'

const boardChanged = z.object({
  boardId: z.uuid(),
  version: z.number().int()
})
type BoardChanged = z.infer<typeof boardChanged>

export type Broker = Pick<RabbitMQClient, 'publish' | 'subscribe'>

let publish: (message: BoardChanged) => void = () => undefined

// After the commit, so a stream never sends a browser to read a version that
// is not there yet, or never will be.
export function tellBoardChanged(
  tx: Tx,
  board: { id: string; version: number }
): void {
  afterCommit(tx, () => {
    publish({ boardId: board.id, version: board.version })
  })
}

// Each replica gets its own queue, since each holds different streams. A
// change lost while it is disconnected only costs a refresh: a stream sends
// the current version when it reopens. The queue drops its oldest versions
// past its length, for the same reason.
export async function listenForBoardChanges(
  broker: Broker,
  exchange: string,
  changes: Pick<Changes, 'emit'>,
  log: Pick<Logger, 'warn'>
): Promise<void> {
  await broker.subscribe(
    exchange,
    BOARD_CHANGED,
    `${exchange}.replica`,
    body => {
      const message = boardChanged.safeParse(body)
      if (message.success) {
        changes.emit(message.data.boardId, message.data.version)
      } else {
        log.warn(
          { routingKey: BOARD_CHANGED },
          'a live message was not understood'
        )
      }
      return Promise.resolve()
    },
    { exclusive: true, queueArguments: { 'x-max-length': 1000 } }
  )
  // A version is only worth something now, so it is not retried across an
  // outage. Still, every one is attempted: after a failed publish, only the
  // next publish reconnects the client.
  publish = message => {
    broker
      .publish(exchange, BOARD_CHANGED, message, { maxAttempts: 1 })
      .catch((error: unknown) => {
        log.warn(
          { err: error, routingKey: BOARD_CHANGED },
          'a live message was not published'
        )
      })
  }
}

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
      const role = await inTenant(deps.db, identity, async tx => {
        await claimInvites(tx)
        return roleOn(tx, identity.userId, boardId)
      })
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
