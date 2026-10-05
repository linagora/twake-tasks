import { and, asc, eq, sql } from 'drizzle-orm'
import { generateNKeysBetween } from 'fractional-indexing'
import postgres from 'postgres'
import { inTenant, type Db, type Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { accessibleBoards, roleOn } from './access.ts'
import {
  sections,
  boardFavorites,
  boardMembers,
  boards,
  taskAssignees,
  tasks
} from './schema.ts'

const DEFAULT_SECTIONS = [
  { name: 'To do', category: 'unstarted' },
  { name: 'In progress', category: 'started' },
  { name: 'Done', category: 'completed' }
] as const

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
      return inTenant(db, identity.organizationId, async tx => {
        const accessible = accessibleBoards(tx, identity.email)
        return tx
          .select({
            id: boards.id,
            name: boards.name,
            keyPrefix: boards.keyPrefix,
            spaceId: boards.spaceId,
            role: accessible.role,
            archived: sql<boolean>`${boards.archivedAt} is not null`,
            favorite: sql<boolean>`${boardFavorites.email} is not null`
          })
          .from(boards)
          .innerJoin(accessible, eq(accessible.boardId, boards.id))
          .leftJoin(
            boardFavorites,
            and(
              eq(boardFavorites.boardId, boards.id),
              eq(boardFavorites.email, identity.email)
            )
          )
          .orderBy(asc(boards.name))
      })
    },

    async createUserBoard(
      identity: Identity,
      input: { name: string; keyPrefix: string }
    ) {
      try {
        return await inTenant(db, identity.organizationId, async tx => {
          const [board] = await tx
            .insert(boards)
            .values({
              organizationId: identity.organizationId,
              ownerEmail: identity.email,
              name: input.name,
              keyPrefix: input.keyPrefix,
              createdBy: identity.email
            })
            .returning()
          if (!board) throw new Error('board insert returned nothing')
          await tx.insert(boardMembers).values({
            boardId: board.id,
            organizationId: identity.organizationId,
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
          return loadBoard(tx, board.id, identity.email)
        })
      } catch (error) {
        if (isUniqueViolation(error)) return null
        throw error
      }
    },

    getBoard(identity: Identity, boardId: string) {
      return inTenant(db, identity.organizationId, tx =>
        loadBoard(tx, boardId, identity.email)
      )
    }
  }
}

async function loadBoard(tx: Tx, boardId: string, email: string) {
  const role = await roleOn(tx, email, boardId)
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
  const assignees = await tx
    .select({ taskId: taskAssignees.taskId, email: taskAssignees.email })
    .from(taskAssignees)
    .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
    .where(eq(tasks.boardId, boardId))
    .orderBy(asc(taskAssignees.email))
  return {
    id: board.id,
    name: board.name,
    keyPrefix: board.keyPrefix,
    spaceId: board.spaceId,
    archived: board.archivedAt !== null,
    version: board.version,
    role,
    sections: sectionRows,
    tasks: rows.map(task => ({
      id: task.id,
      key: `${board.keyPrefix}-${String(task.number)}`,
      sectionId: task.sectionId,
      title: task.title,
      priority: task.priority,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      canceledAt: task.canceledAt,
      assignees: assignees
        .filter(assignee => assignee.taskId === task.id)
        .map(assignee => assignee.email)
    }))
  }
}
