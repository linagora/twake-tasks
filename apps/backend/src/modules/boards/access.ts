import { and, asc, eq, isNull, or, sql } from 'drizzle-orm'
import type { Tx } from '../../infra/db.ts'
import { spaceMembers, spaces } from '../spaces/schema.ts'
import { boardMembers, boards } from './schema.ts'

export type Role = 'viewer' | 'editor' | 'admin'

// Every permission check goes through this query: a space board takes the
// person's role in the space, a user's board their role on the board.
export function accessibleBoards(tx: Tx, userId: string) {
  return tx
    .select({
      boardId: boards.id,
      role: sql<Role>`coalesce(${spaceMembers.role}, ${boardMembers.role})`.as(
        'role'
      )
    })
    .from(boards)
    .leftJoin(
      boardMembers,
      and(eq(boardMembers.boardId, boards.id), eq(boardMembers.userId, userId))
    )
    .leftJoin(
      spaces,
      and(eq(spaces.id, boards.spaceId), isNull(spaces.deletedAt))
    )
    .leftJoin(
      spaceMembers,
      and(eq(spaceMembers.spaceId, spaces.id), eq(spaceMembers.userId, userId))
    )
    .where(
      or(
        and(isNull(boards.spaceId), eq(boardMembers.userId, userId)),
        eq(spaceMembers.userId, userId)
      )
    )
    .as('accessible')
}

// The people who can open a board: its space's members for a space board,
// its own members otherwise.
export function membersOf(
  tx: Tx,
  board: { id: string; spaceId: string | null }
): Promise<{ userId: string; email: string }[]> {
  if (board.spaceId === null) {
    return tx
      .select({ userId: boardMembers.userId, email: boardMembers.email })
      .from(boardMembers)
      .where(eq(boardMembers.boardId, board.id))
      .orderBy(asc(boardMembers.email))
  }
  return tx
    .select({ userId: spaceMembers.userId, email: spaceMembers.email })
    .from(spaceMembers)
    .innerJoin(
      spaces,
      and(eq(spaces.id, spaceMembers.spaceId), isNull(spaces.deletedAt))
    )
    .where(eq(spaceMembers.spaceId, board.spaceId))
    .orderBy(asc(spaceMembers.email))
}

export async function roleOn(
  tx: Tx,
  userId: string,
  boardId: string
): Promise<Role | null> {
  const accessible = accessibleBoards(tx, userId)
  const [row] = await tx
    .select({ role: accessible.role })
    .from(accessible)
    .where(eq(accessible.boardId, boardId))
  return row?.role ?? null
}
