import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'
import type { Tx } from '../../infra/db.ts'
import { Refused } from '../kernel/index.ts'
import { tellBoardChanged } from '../live/index.ts'
import { boards } from './schema.ts'

// Updating the board row serializes writes to the board, so call it before
// reading what the write depends on. The version bump rides in the same
// transaction as the change.
export async function bumpBoard(
  tx: Tx,
  boardId: string,
  extra: { taskCounter?: SQL } = {}
) {
  const [board] = await bumpBoards(
    tx,
    and(eq(boards.id, boardId), sql`${boards.archivedAt} is null`),
    extra
  )
  if (!board) throw new Refused('archived')
  return board
}

/** Bumps the version of the boards matched, and tells their live viewers. */
export async function bumpBoards(
  tx: Tx,
  where: SQL | undefined,
  extra: { taskCounter?: SQL; archivedAt?: SQL | null } = {}
) {
  const bumped = await tx
    .update(boards)
    .set({ version: sql`${boards.version} + 1`, ...extra })
    .where(where)
    .returning({
      id: boards.id,
      version: boards.version,
      number: boards.taskCounter,
      keyPrefix: boards.keyPrefix,
      organizationId: boards.organizationId,
      projectId: boards.projectId
    })
  for (const board of bumped) tellBoardChanged(tx, board)
  return bumped
}

/** Their open boards reload, members and roles included. */
export async function bumpProjects(tx: Tx, projectIds: string[]) {
  if (projectIds.length === 0) return
  await bumpBoards(tx, inArray(boards.projectId, projectIds))
}
