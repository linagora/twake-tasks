import { eq } from 'drizzle-orm'
import type { Db } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { roleOn } from './access.ts'
import { boardLayouts, boards, type LAYOUTS } from './schema.ts'
import { bumpBoard, checkRole, Refused, writeOrRefuse } from './tasks.ts'

export type Layout = (typeof LAYOUTS)[number]

export function createLayoutStore(db: Db) {
  return {
    setLayout(identity: Identity, boardId: string, layout: Layout) {
      return writeOrRefuse(db, identity, async tx => {
        if (!(await roleOn(tx, identity.userId, boardId))) {
          throw new Refused('not_found')
        }
        const [board] = await tx
          .select({ organizationId: boards.organizationId })
          .from(boards)
          .where(eq(boards.id, boardId))
        if (!board) throw new Refused('not_found')
        await tx
          .insert(boardLayouts)
          .values({
            boardId,
            organizationId: board.organizationId,
            userId: identity.userId,
            layout
          })
          .onConflictDoUpdate({
            target: [boardLayouts.userId, boardLayouts.boardId],
            set: { layout }
          })
      })
    },

    setDefaultLayout(identity: Identity, boardId: string, layout: Layout) {
      return writeOrRefuse(db, identity, async tx => {
        await checkRole(tx, identity, boardId, 'admin')
        await bumpBoard(tx, boardId)
        await tx.update(boards).set({ layout }).where(eq(boards.id, boardId))
      })
    }
  }
}
