import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { inTenant, type Db } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { Refused, writeOrRefuse, type Result } from '../kernel/index.ts'
import { checkRole, roleOn } from './access.ts'
import { boardCovers, boards, type BACKGROUNDS } from './schema.ts'
import { bumpBoard } from './versions.ts'

export type Background = Exclude<(typeof BACKGROUNDS)[number], 'custom'>

export const BACKGROUND_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// Kept in Postgres, so the frontend shrinks pictures until they fit.
export const MAX_BACKGROUND_BYTES = 500 * 1024

export function createBackgroundStore(db: Db) {
  const replace = (
    identity: Identity,
    boardId: string,
    cover: Pick<
      typeof boards.$inferInsert,
      'background' | 'backgroundColor' | 'backgroundImage'
    >
  ) =>
    writeOrRefuse(db, identity, async tx => {
      await checkRole(tx, identity, boardId, 'admin')
      await bumpBoard(tx, boardId)
      await tx.update(boards).set(cover).where(eq(boards.id, boardId))
      await tx.delete(boardCovers).where(eq(boardCovers.boardId, boardId))
    })

  return {
    /** A picture the frontend ships, or null for the default. */
    setBackground: (
      identity: Identity,
      boardId: string,
      background: Background | null
    ) =>
      replace(identity, boardId, {
        background,
        backgroundColor: null,
        backgroundImage: null
      }),

    setBackgroundColor: (identity: Identity, boardId: string, color: string) =>
      replace(identity, boardId, {
        background: null,
        backgroundColor: color.toUpperCase(),
        backgroundImage: null
      }),

    setBackgroundImage: (
      identity: Identity,
      boardId: string,
      contentType: string,
      content: Buffer
    ): Promise<Result<{ image: string }>> =>
      writeOrRefuse(db, identity, async tx => {
        await checkRole(tx, identity, boardId, 'admin')
        await bumpBoard(tx, boardId)
        const image = randomUUID()
        const [board] = await tx
          .update(boards)
          .set({
            background: 'custom',
            backgroundColor: null,
            backgroundImage: image
          })
          .where(eq(boards.id, boardId))
          .returning({ organizationId: boards.organizationId })
        if (!board) throw new Refused('not_found')
        await tx
          .insert(boardCovers)
          .values({
            boardId,
            organizationId: board.organizationId,
            contentType,
            content
          })
          .onConflictDoUpdate({
            target: boardCovers.boardId,
            set: { contentType, content }
          })
        return { image }
      }),

    /** The picture by the id the board gave, to anyone who sees the board. */
    backgroundImage: (identity: Identity, boardId: string, imageId: string) =>
      inTenant(db, identity, async tx => {
        if (!(await roleOn(tx, identity.userId, boardId))) return null
        const [cover] = await tx
          .select({
            body: boardCovers.content,
            contentType: boardCovers.contentType
          })
          .from(boardCovers)
          .innerJoin(boards, eq(boards.id, boardCovers.boardId))
          .where(
            and(
              eq(boardCovers.boardId, boardId),
              eq(boards.backgroundImage, imageId)
            )
          )
        return cover ?? null
      })
  }
}
