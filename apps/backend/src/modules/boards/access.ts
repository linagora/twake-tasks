import { and, asc, eq, isNull } from 'drizzle-orm'
import type { Tx } from '../../infra/db.ts'
import { boards, projectMembers, projects } from './schema.ts'

export type Role = 'viewer' | 'editor' | 'admin'

// Every permission check goes through this query: a board takes the person's
// role in its project.
export function accessibleBoards(tx: Tx, userId: string) {
  return tx
    .select({ boardId: boards.id, role: projectMembers.role })
    .from(boards)
    .innerJoin(
      projects,
      and(eq(projects.id, boards.projectId), isNull(projects.deletedAt))
    )
    .innerJoin(
      projectMembers,
      and(
        eq(projectMembers.projectId, projects.id),
        eq(projectMembers.userId, userId)
      )
    )
    .as('accessible')
}

// The people who can open a board: the members of its project.
export function membersOf(
  tx: Tx,
  board: { projectId: string }
): Promise<{ userId: string; email: string }[]> {
  return tx
    .select({ userId: projectMembers.userId, email: projectMembers.email })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, board.projectId))
    .orderBy(asc(projectMembers.email))
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

export async function roleIn(
  tx: Tx,
  userId: string,
  projectId: string
): Promise<Role | null> {
  const [row] = await tx
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(
      projects,
      and(eq(projects.id, projectMembers.projectId), isNull(projects.deletedAt))
    )
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      )
    )
  return row?.role ?? null
}
