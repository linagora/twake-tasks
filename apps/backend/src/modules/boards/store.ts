import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  lt,
  notExists,
  or,
  sql,
  type SQL
} from 'drizzle-orm'
import { generateNKeysBetween } from 'fractional-indexing'
import postgres from 'postgres'
import { inTenant, type Db, type Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { accessibleBoards, membersOf, roleOn } from './access.ts'
import {
  sections,
  boardFavorites,
  boardLayouts,
  boardMembers,
  boards,
  taskAssignees,
  taskLabels,
  tasks
} from './schema.ts'
import { labelsOn } from './labels.ts'
import { recurrenceOf, shift, todayIn } from './recurrence.ts'

const DEFAULT_SECTIONS = [
  { name: 'To do', category: 'unstarted' },
  { name: 'In progress', category: 'started' },
  { name: 'Done', category: 'completed' }
] as const

export const INBOX_KEY_PREFIX = 'INBOX'

const UNIQUE_VIOLATION = '23505'

const SEARCH_LIMIT = 50

function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined
  return (
    cause instanceof postgres.PostgresError && cause.code === UNIQUE_VIOLATION
  )
}

export function createBoardStore(db: Db) {
  return {
    /** Overdue tasks, then those due within `days` days of today in `zone`. */
    agenda(identity: Identity, zone: string, days: number) {
      return inTenant(db, identity, async tx => {
        const today = todayIn(zone)
        return {
          today,
          tasks: await openTasksOf(
            tx,
            identity.userId,
            and(
              lt(tasks.dueDate, shift(today, days, 'days')),
              mine(tx, identity.userId)
            )
          )
        }
      })
    },

    /** Open tasks assigned to the person, dated ones first. */
    assignedTasks(identity: Identity) {
      return inTenant(db, identity, tx =>
        openTasksOf(tx, identity.userId, assignedTo(tx, identity.userId))
      )
    },

    /** Tasks whose key starts with, or whose title or description contains, `text`. */
    search(identity: Identity, text: string) {
      const pattern = text.replace(/[\\%_]/g, '\\$&')
      return inTenant(db, identity, tx =>
        tasksOf(
          tx,
          identity.userId,
          or(
            sql`${boards.keyPrefix} || '-' || ${tasks.number} ilike ${`${pattern}%`}`,
            ilike(tasks.title, `%${pattern}%`),
            ilike(tasks.descriptionText, `%${pattern}%`)
          ),
          SEARCH_LIMIT
        )
      )
    },

    listBoards(identity: Identity) {
      return inTenant(db, identity, async tx => {
        await ensureInbox(tx, identity)
        const accessible = accessibleBoards(tx, identity.userId)
        return tx
          .select({
            id: boards.id,
            name: boards.name,
            keyPrefix: boards.keyPrefix,
            spaceId: boards.spaceId,
            inbox: boards.inbox,
            role: accessible.role,
            archived: sql<boolean>`${boards.archivedAt} is not null`,
            favorite: sql<boolean>`${boardFavorites.userId} is not null`
          })
          .from(boards)
          .innerJoin(accessible, eq(accessible.boardId, boards.id))
          .leftJoin(
            boardFavorites,
            and(
              eq(boardFavorites.boardId, boards.id),
              eq(boardFavorites.userId, identity.userId)
            )
          )
          .orderBy(
            desc(boards.inbox),
            sql`${boardFavorites.userId} is null`,
            asc(boards.name)
          )
      })
    },

    setFavorite(identity: Identity, boardId: string, favorite: boolean) {
      return inTenant(db, identity, async tx => {
        const [board] = await tx
          .select({ organizationId: boards.organizationId })
          .from(boards)
          .where(eq(boards.id, boardId))
        if (!board || !(await roleOn(tx, identity.userId, boardId))) {
          return false
        }
        if (favorite) {
          await tx
            .insert(boardFavorites)
            .values({
              boardId,
              organizationId: board.organizationId,
              userId: identity.userId
            })
            .onConflictDoNothing()
        } else {
          await tx
            .delete(boardFavorites)
            .where(
              and(
                eq(boardFavorites.boardId, boardId),
                eq(boardFavorites.userId, identity.userId)
              )
            )
        }
        return true
      })
    },

    async createUserBoard(
      identity: Identity,
      input: { name: string; keyPrefix: string }
    ) {
      try {
        return await inTenant(db, identity, async tx => {
          const [board] = await tx
            .insert(boards)
            .values({
              organizationId: identity.organizationId,
              ownerId: identity.userId,
              name: input.name,
              keyPrefix: input.keyPrefix,
              createdBy: identity.userId
            })
            .returning()
          if (!board) throw new Error('board insert returned nothing')
          await tx.insert(boardMembers).values({
            boardId: board.id,
            organizationId: identity.organizationId,
            userId: identity.userId,
            email: identity.email,
            role: 'admin'
          })
          const positions = generateNKeysBetween(
            null,
            null,
            DEFAULT_SECTIONS.length
          )
          await tx.insert(sections).values(
            DEFAULT_SECTIONS.map((section, index) => ({
              ...section,
              boardId: board.id,
              organizationId: identity.organizationId,
              position: positions[index] ?? ''
            }))
          )
          return loadBoard(tx, board.id, identity.userId)
        })
      } catch (error) {
        if (isUniqueViolation(error)) return null
        throw error
      }
    },

    getBoard(identity: Identity, boardId: string) {
      return inTenant(db, identity, tx =>
        loadBoard(tx, boardId, identity.userId)
      )
    }
  }
}

// The Inbox has no sections: its tasks show under "No section". Its key prefix is
// reserved, so any unique conflict here means the Inbox already exists.
async function ensureInbox(tx: Tx, identity: Identity) {
  const [inbox] = await tx
    .insert(boards)
    .values({
      organizationId: identity.organizationId,
      ownerId: identity.userId,
      name: 'Inbox',
      keyPrefix: INBOX_KEY_PREFIX,
      createdBy: identity.userId,
      inbox: true
    })
    .onConflictDoNothing()
    .returning({ id: boards.id })
  if (!inbox) return
  await tx.insert(boardMembers).values({
    boardId: inbox.id,
    organizationId: identity.organizationId,
    userId: identity.userId,
    email: identity.email,
    role: 'admin'
  })
}

async function loadBoard(tx: Tx, boardId: string, userId: string) {
  const role = await roleOn(tx, userId, boardId)
  if (!role) return null
  const [board] = await tx.select().from(boards).where(eq(boards.id, boardId))
  if (!board) return null
  const sectionRows = await tx
    .select({
      id: sections.id,
      name: sections.name,
      category: sections.category
    })
    .from(sections)
    .where(eq(sections.boardId, boardId))
    .orderBy(asc(sections.position))
  const rows = await tx
    .select()
    .from(tasks)
    .where(eq(tasks.boardId, boardId))
    .orderBy(asc(tasks.position))
  const members = await membersOf(tx, board)
  const boardLabels = await labelsOn(tx, board)
  const [picked] = await tx
    .select({ layout: boardLayouts.layout })
    .from(boardLayouts)
    .where(
      and(eq(boardLayouts.boardId, boardId), eq(boardLayouts.userId, userId))
    )
  return {
    layout: picked?.layout ?? board.layout,
    defaultLayout: board.layout,
    id: board.id,
    name: board.name,
    keyPrefix: board.keyPrefix,
    spaceId: board.spaceId,
    inbox: board.inbox,
    archived: board.archivedAt !== null,
    version: board.version,
    role,
    members,
    labels: boardLabels,
    sections: sectionRows,
    tasks: await describeTasks(tx, board, rows, members, boardLabels)
  }
}

async function describeTasks(
  tx: Tx,
  board: typeof boards.$inferSelect,
  rows: (typeof tasks.$inferSelect)[],
  members: { userId: string; email: string }[],
  boardLabels: { id: string; name: string }[]
) {
  const ids = rows.map(task => task.id)
  if (ids.length === 0) return []
  const assignments = await tx
    .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(inArray(taskAssignees.taskId, ids))
  const labeled = await tx
    .select({ taskId: taskLabels.taskId, labelId: taskLabels.labelId })
    .from(taskLabels)
    .where(inArray(taskLabels.taskId, ids))
  return rows.map(task => ({
    id: task.id,
    key: `${board.keyPrefix}-${String(task.number)}`,
    sectionId: task.sectionId,
    parentId: task.parentId,
    title: task.title,
    priority: task.priority,
    dueDate: task.dueDate,
    dueTime: task.dueTime?.slice(0, 5) ?? null,
    dueZone: task.dueZone,
    deadline: task.deadline,
    duration:
      task.duration && task.durationUnit
        ? { amount: task.duration, unit: task.durationUnit }
        : null,
    recurrence: recurrenceOf(task),
    completedAt: task.completedAt,
    canceledAt: task.canceledAt,
    // Someone who left the board stays assigned, but is not shown.
    assignees: members.filter(member =>
      assignments.some(
        assigned =>
          assigned.taskId === task.id && assigned.userId === member.userId
      )
    ),
    labels: boardLabels.filter(label =>
      labeled.some(
        entry => entry.taskId === task.id && entry.labelId === label.id
      )
    )
  }))
}

export const assignedTo = (tx: Tx, userId: string) =>
  exists(
    tx
      .select({ one: sql`1` })
      .from(taskAssignees)
      .where(
        and(
          eq(taskAssignees.taskId, tasks.id),
          eq(taskAssignees.userId, userId)
        )
      )
  )

// A task is someone's when it is assigned to them, or when it sits unassigned
// on one of their own boards. Unassigned space tasks belong to nobody yet.
const mine = (tx: Tx, userId: string) =>
  or(
    assignedTo(tx, userId),
    and(
      isNull(boards.spaceId),
      notExists(
        tx
          .select({ one: sql`1` })
          .from(taskAssignees)
          .where(eq(taskAssignees.taskId, tasks.id))
      )
    )
  )

export function openTasksOf(tx: Tx, userId: string, which: SQL | undefined) {
  return tasksOf(
    tx,
    userId,
    and(
      isNull(boards.archivedAt),
      isNull(tasks.completedAt),
      isNull(tasks.canceledAt),
      which
    )
  )
}

async function tasksOf(
  tx: Tx,
  userId: string,
  which: SQL | undefined,
  limit?: number
) {
  const accessible = accessibleBoards(tx, userId)
  const query = tx
    .select({ task: tasks, board: boards })
    .from(tasks)
    .innerJoin(boards, eq(boards.id, tasks.boardId))
    .innerJoin(accessible, eq(accessible.boardId, boards.id))
    .where(which)
    .orderBy(
      sql`${tasks.dueDate} asc nulls last`,
      sql`${tasks.dueTime} asc nulls last`,
      sql`${tasks.priority} asc nulls last`,
      asc(boards.name),
      asc(tasks.number)
    )
  const rows = await (limit === undefined ? query : query.limit(limit))
  const described = new Map<string, Awaited<ReturnType<typeof describeTasks>>>()
  for (const board of new Map(
    rows.map(row => [row.board.id, row.board])
  ).values()) {
    described.set(
      board.id,
      await describeTasks(
        tx,
        board,
        rows.filter(row => row.board.id === board.id).map(row => row.task),
        await membersOf(tx, board),
        await labelsOn(tx, board)
      )
    )
  }
  return rows.map(({ task, board }) => ({
    ...described.get(board.id)?.find(each => each.id === task.id),
    boardId: board.id,
    boardName: board.name
  }))
}
