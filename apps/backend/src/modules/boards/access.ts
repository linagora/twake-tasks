import { and, eq, isNull, or, sql } from 'drizzle-orm'
import type { Tx } from '../../infra/db.ts'
import { spaceMembers, spaces } from '../spaces/schema.ts'
import { boardMembers, boards } from './schema.ts'

export type Role = 'viewer' | 'editor' | 'admin'

// Every permission check goes through this query: a space board takes the
// person's role in the space, a user's board their role on the board.
export function accessibleBoards(tx: Tx, email: string) {
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
      and(eq(boardMembers.boardId, boards.id), eq(boardMembers.email, email))
    )
    .leftJoin(
      spaces,
      and(eq(spaces.id, boards.spaceId), isNull(spaces.deletedAt))
    )
    .leftJoin(
      spaceMembers,
      and(eq(spaceMembers.spaceId, spaces.id), eq(spaceMembers.email, email))
    )
    .where(
      or(
        and(isNull(boards.spaceId), eq(boardMembers.email, email)),
        eq(spaceMembers.email, email)
      )
    )
    .as('accessible')
}

export async function roleOn(
  tx: Tx,
  email: string,
  boardId: string
): Promise<Role | null> {
  const accessible = accessibleBoards(tx, email)
  const [row] = await tx
    .select({ role: accessible.role })
    .from(accessible)
    .where(eq(accessible.boardId, boardId))
  return row?.role ?? null
}
