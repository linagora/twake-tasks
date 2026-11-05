import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { inTenant, type Db } from '../../infra/db.ts'
import type { ObjectStorage } from '../../infra/objectStorage.ts'
import type { Identity } from '../auth/index.ts'
import { writeOrRefuse, type Result } from '../kernel/index.ts'
import { checkRole, roleOn } from './access.ts'
import { boards, type BACKGROUNDS } from './schema.ts'
import { bumpBoard } from './versions.ts'

export type Background = Exclude<(typeof BACKGROUNDS)[number], 'custom'>

export const BACKGROUND_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// A screen's width of JPEG, which the frontend shrinks pictures to.
export const MAX_BACKGROUND_BYTES = 2 * 1024 * 1024

// Queued by a trigger when a board drops its picture or is deleted, so the
// picture goes once the change committed, whichever way the board went.
export const COVER_DELETE_JOB = 'cover_delete'

const keyOf = (imageId: string) => `covers/${imageId}`

export function createBackgroundStore(
  db: Db,
  storage: ObjectStorage | undefined
) {
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

    async setBackgroundImage(
      identity: Identity,
      boardId: string,
      contentType: string,
      content: Buffer
    ): Promise<Result<{ image: string }>> {
      if (!storage) return { ok: false, error: 'not_found' }
      const image = randomUUID()
      // Stored before the transaction, which would otherwise hold the board's
      // row and a connection through the upload. A board that does not take
      // it leaves no picture behind.
      await storage.put(keyOf(image), content, contentType)
      const drop = () => storage.remove(keyOf(image)).catch(() => undefined)
      try {
        const result = await writeOrRefuse(db, identity, async tx => {
          await checkRole(tx, identity, boardId, 'admin')
          await bumpBoard(tx, boardId)
          await tx
            .update(boards)
            .set({
              background: 'custom',
              backgroundColor: null,
              backgroundImage: image
            })
            .where(eq(boards.id, boardId))
          return { image }
        })
        if (!result.ok) await drop()
        return result
      } catch (error) {
        await drop()
        throw error
      }
    },

    /** The picture by the id the board gave, to anyone who sees the board. */
    async backgroundImage(
      identity: Identity,
      boardId: string,
      imageId: string
    ) {
      if (!storage) return null
      const current = await inTenant(db, identity, async tx => {
        if (!(await roleOn(tx, identity.userId, boardId))) return null
        const [board] = await tx
          .select({ image: boards.backgroundImage })
          .from(boards)
          .where(eq(boards.id, boardId))
        return board?.image ?? null
      })
      return current === imageId ? storage.get(keyOf(imageId)) : null
    }
  }
}

// A scheduler Handler, untyped as one: the scheduler's schema imports boards.
export function deleteCover(storage: ObjectStorage | undefined) {
  return (payload: unknown) => {
    const { imageId } = payload as { imageId: string }
    return Promise.resolve(storage && (() => storage.remove(keyOf(imageId))))
  }
}
