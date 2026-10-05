import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { roleOn, type Role } from './access.ts'
import {
  boardInvites,
  boardMembers,
  boards,
  taskAssignees,
  tasks
} from './schema.ts'
import { checkRole, Refused, writeOrRefuse } from './tasks.ts'

// Only a user's own boards are shared: a space board takes the space's members,
// and the Inbox stays private.
async function sharedBoard(tx: Tx, identity: Identity, boardId: string) {
  await checkRole(tx, identity, boardId, 'admin')
  const [board] = await tx
    .select({
      organizationId: boards.organizationId,
      spaceId: boards.spaceId,
      inbox: boards.inbox
    })
    .from(boards)
    .where(eq(boards.id, boardId))
  if (!board) throw new Refused('not_found')
  if (board.spaceId !== null || board.inbox) throw new Refused('forbidden')
  return board
}

async function keepAnAdmin(tx: Tx, boardId: string, leaving: string) {
  const [other] = await tx
    .select({ userId: boardMembers.userId })
    .from(boardMembers)
    .where(
      and(
        eq(boardMembers.boardId, boardId),
        eq(boardMembers.role, 'admin'),
        ne(boardMembers.userId, leaving)
      )
    )
    .limit(1)
  if (!other) throw new Refused('last_admin')
}

export function createSharingStore(db: Db) {
  return {
    invite(identity: Identity, boardId: string, email: string, role: Role) {
      return writeOrRefuse(db, identity, async tx => {
        const board = await sharedBoard(tx, identity, boardId)
        const [member] = await tx
          .select({ userId: boardMembers.userId })
          .from(boardMembers)
          .where(
            and(
              eq(boardMembers.boardId, boardId),
              eq(sql`lower(${boardMembers.email})`, email)
            )
          )
        if (member) return
        await tx
          .insert(boardInvites)
          .values({
            boardId,
            organizationId: board.organizationId,
            email,
            role,
            invitedBy: identity.userId
          })
          .onConflictDoUpdate({
            target: [boardInvites.boardId, boardInvites.email],
            set: { role }
          })
      })
    },

    sharing(identity: Identity, boardId: string) {
      return writeOrRefuse(db, identity, async tx => {
        await sharedBoard(tx, identity, boardId)
        return {
          members: await tx
            .select({
              userId: boardMembers.userId,
              email: boardMembers.email,
              role: boardMembers.role
            })
            .from(boardMembers)
            .where(eq(boardMembers.boardId, boardId))
            .orderBy(asc(boardMembers.email)),
          invites: await tx
            .select({
              id: boardInvites.id,
              email: boardInvites.email,
              role: boardInvites.role
            })
            .from(boardInvites)
            .where(eq(boardInvites.boardId, boardId))
            .orderBy(asc(boardInvites.email))
        }
      })
    },

    cancelInvite(identity: Identity, boardId: string, inviteId: string) {
      return writeOrRefuse(db, identity, async tx => {
        await sharedBoard(tx, identity, boardId)
        await tx
          .delete(boardInvites)
          .where(
            and(
              eq(boardInvites.boardId, boardId),
              eq(boardInvites.id, inviteId)
            )
          )
      })
    },

    setRole(identity: Identity, boardId: string, userId: string, role: Role) {
      return writeOrRefuse(db, identity, async tx => {
        await sharedBoard(tx, identity, boardId)
        if (role !== 'admin') await keepAnAdmin(tx, boardId, userId)
        const updated = await tx
          .update(boardMembers)
          .set({ role })
          .where(
            and(
              eq(boardMembers.boardId, boardId),
              eq(boardMembers.userId, userId)
            )
          )
          .returning({ userId: boardMembers.userId })
        if (updated.length === 0) throw new Refused('not_found')
      })
    },

    // Anyone may leave; only an admin removes someone else.
    removeMember(identity: Identity, boardId: string, userId: string) {
      return writeOrRefuse(db, identity, async tx => {
        if (userId === identity.userId) {
          if (!(await roleOn(tx, identity.userId, boardId))) {
            throw new Refused('not_found')
          }
          const [board] = await tx
            .select({ spaceId: boards.spaceId, inbox: boards.inbox })
            .from(boards)
            .where(eq(boards.id, boardId))
          if (!board || board.spaceId !== null || board.inbox) {
            throw new Refused('forbidden')
          }
        } else {
          await sharedBoard(tx, identity, boardId)
        }
        await keepAnAdmin(tx, boardId, userId)
        const removed = await tx
          .delete(boardMembers)
          .where(
            and(
              eq(boardMembers.boardId, boardId),
              eq(boardMembers.userId, userId)
            )
          )
          .returning({ userId: boardMembers.userId })
        if (removed.length === 0) throw new Refused('not_found')
        await tx
          .delete(taskAssignees)
          .where(
            and(
              eq(taskAssignees.userId, userId),
              inArray(
                taskAssignees.taskId,
                tx
                  .select({ id: tasks.id })
                  .from(tasks)
                  .where(eq(tasks.boardId, boardId))
              )
            )
          )
      })
    }
  }
}
