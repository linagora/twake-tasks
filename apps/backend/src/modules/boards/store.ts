import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { generateNKeysBetween } from 'fractional-indexing'
import postgres from 'postgres'
import { inTenant, type Db, type Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { accessibleBoards, membersOf, roleOn } from './access.ts'
import {
  sections,
  boardFavorites,
  boardMembers,
  boards,
  taskAssignees,
  taskLabels,
  tasks
} from './schema.ts'
import { labelsOn } from './labels.ts'

const DEFAULT_SECTIONS = [
  { name: 'To do', category: 'unstarted' },
  { name: 'In progress', category: 'started' },
  { name: 'Done', category: 'completed' }
] as const

export const INBOX_KEY_PREFIX = 'INBOX'

const UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined
  return (
    cause instanceof postgres.PostgresError && cause.code === UNIQUE_VIOLATION
  )
}

export function createBoardStore(db: Db) {
  return {
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
  const assignments = await tx
    .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId })
    .from(taskAssignees)
    .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
    .where(eq(tasks.boardId, boardId))
  const boardLabels = await labelsOn(tx, board)
  const labeled = await tx
    .select({ taskId: taskLabels.taskId, labelId: taskLabels.labelId })
    .from(taskLabels)
    .innerJoin(tasks, eq(tasks.id, taskLabels.taskId))
    .where(eq(tasks.boardId, boardId))
  return {
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
    tasks: rows.map(task => ({
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
}
