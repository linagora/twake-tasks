import { and, eq } from 'drizzle-orm'
import { inTenant, type Db } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { roleOn } from './access.ts'
import { boardBackgroundImages, boards, type BACKGROUNDS } from './schema.ts'
import { bumpBoard, checkRole, writeOrRefuse } from './tasks.ts'

export type Background = Exclude<(typeof BACKGROUNDS)[number], 'custom'>

export const BACKGROUND_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// A screen's width of JPEG, which the frontend shrinks pictures to.
export const MAX_BACKGROUND_BYTES = 2 * 1024 * 1024

export function createBackgroundStore(db: Db) {
  return {
    /** A picture the frontend ships, or null for the default. Admins only. */
    setBackground(
      identity: Identity,
      boardId: string,
      background: Background | null
    ) {
      return writeOrRefuse(db, identity, async tx => {
        await checkRole(tx, identity, boardId, 'admin')
        await bumpBoard(tx, boardId)
        await tx
          .update(boards)
          .set({ background })
          .where(eq(boards.id, boardId))
        await tx
          .delete(boardBackgroundImages)
          .where(eq(boardBackgroundImages.boardId, boardId))
      })
    },

    /** Replaces the board's background with a picture of the admin's. */
    setBackgroundImage(
      identity: Identity,
      boardId: string,
      contentType: string,
      content: Buffer
    ) {
      return writeOrRefuse(db, identity, async tx => {
        await checkRole(tx, identity, boardId, 'admin')
        const board = await bumpBoard(tx, boardId)
        await tx
          .update(boards)
          .set({ background: 'custom' })
          .where(eq(boards.id, boardId))
        await tx
          .delete(boardBackgroundImages)
          .where(eq(boardBackgroundImages.boardId, boardId))
        const [image] = await tx
          .insert(boardBackgroundImages)
          .values({
            boardId,
            organizationId: board.organizationId,
            contentType,
            content
          })
          .returning({ id: boardBackgroundImages.id })
        if (!image) throw new Error('background insert returned nothing')
        return { image: image.id }
      })
    },

    /** The picture by the id the board gave, to anyone who sees the board. */
    backgroundImage(identity: Identity, boardId: string, imageId: string) {
      return inTenant(db, identity, async tx => {
        if (!(await roleOn(tx, identity.userId, boardId))) return null
        const [image] = await tx
          .select({
            contentType: boardBackgroundImages.contentType,
            content: boardBackgroundImages.content
          })
          .from(boardBackgroundImages)
          .where(
            and(
              eq(boardBackgroundImages.boardId, boardId),
              eq(boardBackgroundImages.id, imageId)
            )
          )
        return image ?? null
      })
    }
  }
}
