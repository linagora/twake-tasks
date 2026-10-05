import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import { generateKeyBetween } from 'fractional-indexing'
import { inTenant, type Db, type Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { roleOn } from './access.ts'
import { boards, sections, tasks } from './schema.ts'

export type Refusal =
  | 'not_found'
  | 'forbidden'
  | 'archived'
  | 'invalid_section'
  | 'stale_neighbours'
export type Result<T> = { ok: true; value: T } | { ok: false; error: Refusal }

// Thrown, not returned, so the transaction rolls back whatever ran before it.
class Refused extends Error {
  readonly refusal: Refusal

  constructor(refusal: Refusal) {
    super(refusal)
    this.refusal = refusal
  }
}

function completionFor(
  category: string | null,
  since?: { completedAt: Date | null; canceledAt: Date | null }
) {
  return {
    completedAt:
      category === 'completed' ? (since?.completedAt ?? new Date()) : null,
    canceledAt:
      category === 'canceled' ? (since?.canceledAt ?? new Date()) : null
  }
}

// Neighbours come from what the client saw. When they no longer sit next to
// each other the board changed underneath, so the client reloads and retries.
function positionBetween(
  others: { id: string; position: string }[],
  afterId: string | undefined,
  beforeId: string | undefined
): string {
  const after = afterId ? others.findIndex(task => task.id === afterId) : -1
  const before = beforeId ? others.findIndex(task => task.id === beforeId) : -1
  if ((afterId && after < 0) || (beforeId && before < 0)) {
    throw new Refused('stale_neighbours')
  }
  if (afterId && beforeId && before !== after + 1) {
    throw new Refused('stale_neighbours')
  }
  const lower = afterId
    ? others[after]
    : beforeId
      ? others[before - 1]
      : others.at(-1)
  const upper = afterId ? others[after + 1] : beforeId ? others[before] : null
  return generateKeyBetween(lower?.position ?? null, upper?.position ?? null)
}

async function checkEditor(tx: Tx, identity: Identity, boardId: string) {
  const role = await roleOn(tx, identity.email, boardId)
  if (!role) throw new Refused('not_found')
  if (role === 'viewer') throw new Refused('forbidden')
}

async function sectionOf(tx: Tx, boardId: string, sectionId: string | null) {
  if (sectionId === null) return null
  const [section] = await tx
    .select()
    .from(sections)
    .where(and(eq(sections.id, sectionId), eq(sections.boardId, boardId)))
  if (!section) throw new Refused('invalid_section')
  return section
}

async function taskOf(tx: Tx, boardId: string, taskId: string) {
  const [task] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.boardId, boardId)))
  if (!task) throw new Refused('not_found')
  return task
}

function inSection(boardId: string, sectionId: string | null) {
  return and(
    eq(tasks.boardId, boardId),
    sectionId === null
      ? isNull(tasks.sectionId)
      : eq(tasks.sectionId, sectionId)
  )
}

// Updating the board row serializes writes to the board, so call it before
// reading what the write depends on. The version bump rides in the same
// transaction as the change.
async function bumpBoard(
  tx: Tx,
  boardId: string,
  extra: { taskCounter?: ReturnType<typeof sql> } = {}
) {
  const [board] = await tx
    .update(boards)
    .set({ version: sql`${boards.version} + 1`, ...extra })
    .where(and(eq(boards.id, boardId), sql`${boards.archivedAt} is null`))
    .returning({
      number: boards.taskCounter,
      keyPrefix: boards.keyPrefix,
      organizationId: boards.organizationId
    })
  if (!board) throw new Refused('archived')
  return board
}

export function createTaskStore(db: Db) {
  async function write<T>(
    identity: Identity,
    work: (tx: Tx) => Promise<T>
  ): Promise<Result<T>> {
    try {
      return {
        ok: true,
        value: await inTenant(db, identity, work)
      }
    } catch (error) {
      if (error instanceof Refused) return { ok: false, error: error.refusal }
      throw error
    }
  }

  return {
    createTask(
      identity: Identity,
      boardId: string,
      input: { sectionId: string | null; title: string }
    ) {
      return write(identity, async tx => {
        await checkEditor(tx, identity, boardId)
        const section = await sectionOf(tx, boardId, input.sectionId)
        const board = await bumpBoard(tx, boardId, {
          taskCounter: sql`${boards.taskCounter} + 1`
        })
        const [last] = await tx
          .select({ position: tasks.position })
          .from(tasks)
          .where(inSection(boardId, input.sectionId))
          .orderBy(desc(tasks.position))
          .limit(1)
        const [task] = await tx
          .insert(tasks)
          .values({
            boardId,
            sectionId: input.sectionId,
            organizationId: board.organizationId,
            number: board.number,
            title: input.title,
            position: generateKeyBetween(last?.position ?? null, null),
            createdBy: identity.email,
            ...completionFor(section?.category ?? null)
          })
          .returning()
        if (!task) throw new Error('task insert returned nothing')
        return {
          id: task.id,
          key: `${board.keyPrefix}-${String(task.number)}`,
          title: task.title,
          sectionId: task.sectionId
        }
      })
    },

    moveTask(
      identity: Identity,
      boardId: string,
      taskId: string,
      input: {
        sectionId: string | null
        afterId?: string | undefined
        beforeId?: string | undefined
      }
    ) {
      return write(identity, async tx => {
        await checkEditor(tx, identity, boardId)
        const section = await sectionOf(tx, boardId, input.sectionId)
        await bumpBoard(tx, boardId)
        const task = await taskOf(tx, boardId, taskId)
        const others = await tx
          .select({ id: tasks.id, position: tasks.position })
          .from(tasks)
          .where(and(inSection(boardId, input.sectionId), ne(tasks.id, taskId)))
          .orderBy(asc(tasks.position))
        await tx
          .update(tasks)
          .set({
            sectionId: input.sectionId,
            position: positionBetween(others, input.afterId, input.beforeId),
            ...completionFor(section?.category ?? null, task)
          })
          .where(eq(tasks.id, taskId))
        return null
      })
    },

    editTask(
      identity: Identity,
      boardId: string,
      taskId: string,
      changes: {
        title?: string | undefined
        priority?: number | null | undefined
        dueDate?: string | null | undefined
      }
    ) {
      return write(identity, async tx => {
        await checkEditor(tx, identity, boardId)
        await bumpBoard(tx, boardId)
        await taskOf(tx, boardId, taskId)
        await tx.update(tasks).set(changes).where(eq(tasks.id, taskId))
        return null
      })
    }
  }
}
