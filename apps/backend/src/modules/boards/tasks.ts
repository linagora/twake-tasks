import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import { generateKeyBetween } from 'fractional-indexing'
import { inTenant, type Db, type Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { membersOf, roleOn } from './access.ts'
import { plainText } from './markdown.ts'
import { boards, sections, taskAssignees, tasks } from './schema.ts'

export type Refusal =
  | 'not_found'
  | 'forbidden'
  | 'archived'
  | 'invalid_section'
  | 'stale_neighbours'
  | 'section_not_empty'
  | 'invalid_assignee'
  | 'stale_version'
  | 'invalid_parent'
  | 'too_deep'
  | 'invalid_label'
  | 'label_taken'
export type Result<T> = { ok: true; value: T } | { ok: false; error: Refusal }

// Thrown, not returned, so the transaction rolls back whatever ran before it.
export class Refused extends Error {
  readonly refusal: Refusal

  constructor(refusal: Refusal) {
    super(refusal)
    this.refusal = refusal
  }
}

export function completionFor(
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
export function positionBetween(
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

export async function checkRole(
  tx: Tx,
  identity: Identity,
  boardId: string,
  needed: 'editor' | 'admin'
) {
  const role = await roleOn(tx, identity.userId, boardId)
  if (!role) throw new Refused('not_found')
  if (role === 'viewer' || (needed === 'admin' && role !== 'admin')) {
    throw new Refused('forbidden')
  }
}

export async function sectionOf(
  tx: Tx,
  boardId: string,
  sectionId: string | null
) {
  if (sectionId === null) return null
  const [section] = await tx
    .select()
    .from(sections)
    .where(and(eq(sections.id, sectionId), eq(sections.boardId, boardId)))
  if (!section) throw new Refused('invalid_section')
  return section
}

export async function taskOf(tx: Tx, boardId: string, taskId: string) {
  const [task] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.boardId, boardId)))
  if (!task) throw new Refused('not_found')
  return task
}

const MAX_DEPTH = 4

async function depthOf(tx: Tx, taskId: string): Promise<number> {
  const [chain] = await tx.execute<{ depth: number }>(sql`
    with recursive chain as (
      select ${tasks.id}, ${tasks.parentId} from ${tasks} where ${tasks.id} = ${taskId}
      union all
      select parent.id, parent.parent_id from ${tasks} parent
      join chain on parent.id = chain.parent_id
    )
    select count(*)::int as depth from chain`)
  return chain?.depth ?? 0
}

export function inSection(boardId: string, sectionId: string | null) {
  return and(
    eq(tasks.boardId, boardId),
    isNull(tasks.parentId),
    sectionId === null
      ? isNull(tasks.sectionId)
      : eq(tasks.sectionId, sectionId)
  )
}

// Updating the board row serializes writes to the board, so call it before
// reading what the write depends on. The version bump rides in the same
// transaction as the change.
export async function bumpBoard(
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
      organizationId: boards.organizationId,
      spaceId: boards.spaceId,
      ownerId: boards.ownerId
    })
  if (!board) throw new Refused('archived')
  return board
}

export async function writeOrRefuse<T>(
  db: Db,
  identity: Identity,
  work: (tx: Tx) => Promise<T>
): Promise<Result<T>> {
  try {
    return { ok: true, value: await inTenant(db, identity, work) }
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.refusal }
    throw error
  }
}

export function createTaskStore(db: Db) {
  const write = <T>(identity: Identity, work: (tx: Tx) => Promise<T>) =>
    writeOrRefuse(db, identity, work)

  return {
    createTask(
      identity: Identity,
      boardId: string,
      input: { title: string } & (
        { sectionId: string | null } | { parentId: string }
      )
    ) {
      return write(identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        const board = await bumpBoard(tx, boardId, {
          taskCounter: sql`${boards.taskCounter} + 1`
        })
        const sectionId = 'sectionId' in input ? input.sectionId : null
        const parentId = 'parentId' in input ? input.parentId : null
        const section = await sectionOf(tx, boardId, sectionId)
        if (parentId !== null) {
          const [parent] = await tx
            .select({ id: tasks.id })
            .from(tasks)
            .where(and(eq(tasks.id, parentId), eq(tasks.boardId, boardId)))
          if (!parent) throw new Refused('invalid_parent')
          if ((await depthOf(tx, parentId)) >= MAX_DEPTH) {
            throw new Refused('too_deep')
          }
        }
        const [last] = await tx
          .select({ position: tasks.position })
          .from(tasks)
          .where(
            parentId === null
              ? inSection(boardId, sectionId)
              : and(eq(tasks.boardId, boardId), eq(tasks.parentId, parentId))
          )
          .orderBy(desc(tasks.position))
          .limit(1)
        const [task] = await tx
          .insert(tasks)
          .values({
            boardId,
            sectionId,
            parentId,
            organizationId: board.organizationId,
            number: board.number,
            title: input.title,
            position: generateKeyBetween(last?.position ?? null, null),
            createdBy: identity.userId,
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
        await checkRole(tx, identity, boardId, 'editor')
        await bumpBoard(tx, boardId)
        const section = await sectionOf(tx, boardId, input.sectionId)
        const task = await taskOf(tx, boardId, taskId)
        if (task.parentId !== null) throw new Refused('invalid_section')
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
        await checkRole(tx, identity, boardId, 'editor')
        await bumpBoard(tx, boardId)
        await taskOf(tx, boardId, taskId)
        await tx.update(tasks).set(changes).where(eq(tasks.id, taskId))
        return null
      })
    },

    // A task in a section completes by moving to a completed section.
    completeTask(
      identity: Identity,
      boardId: string,
      taskId: string,
      state: 'completed' | 'canceled' | null
    ) {
      return write(identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        await bumpBoard(tx, boardId)
        const task = await taskOf(tx, boardId, taskId)
        if (task.sectionId !== null) throw new Refused('invalid_section')
        await tx
          .update(tasks)
          .set(completionFor(state, task))
          .where(eq(tasks.id, taskId))
        return null
      })
    },

    getDescription(identity: Identity, boardId: string, taskId: string) {
      return write(identity, async tx => {
        if (!(await roleOn(tx, identity.userId, boardId))) {
          throw new Refused('not_found')
        }
        const task = await taskOf(tx, boardId, taskId)
        return { markdown: task.description, version: task.descriptionVersion }
      })
    },

    setDescription(
      identity: Identity,
      boardId: string,
      taskId: string,
      edit: { markdown: string; version: number }
    ) {
      return write(identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        await bumpBoard(tx, boardId)
        const task = await taskOf(tx, boardId, taskId)
        if (task.descriptionVersion !== edit.version) {
          throw new Refused('stale_version')
        }
        const version = edit.version + 1
        await tx
          .update(tasks)
          .set({
            description: edit.markdown,
            descriptionText: plainText(edit.markdown),
            descriptionVersion: version
          })
          .where(eq(tasks.id, taskId))
        return { version }
      })
    },

    setAssignees(
      identity: Identity,
      boardId: string,
      taskId: string,
      userIds: string[]
    ) {
      return write(identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        const board = await bumpBoard(tx, boardId)
        const task = await taskOf(tx, boardId, taskId)
        const members = await membersOf(tx, { id: boardId, ...board })
        if (
          !userIds.every(userId =>
            members.some(member => member.userId === userId)
          )
        ) {
          throw new Refused('invalid_assignee')
        }
        await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId))
        if (userIds.length > 0) {
          await tx.insert(taskAssignees).values(
            [...new Set(userIds)].map(userId => ({
              taskId,
              organizationId: task.organizationId,
              userId
            }))
          )
        }
        return null
      })
    }
  }
}
