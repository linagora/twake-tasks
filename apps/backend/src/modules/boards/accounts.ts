import { and, asc, eq, ne, notExists } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import type { PlatformEvent } from '../../events/envelope.ts'
import {
  parseOrDrop,
  RejectedEventError,
  type Handler
} from '../../events/router.ts'
import { asOrganization, asTenant, type Tx } from '../../infra/db.ts'
import { spaceMembers } from '../spaces/schema.ts'
import { boardMembers, boards, taskAssignees } from './schema.ts'

// ldap-rest names B2B users by email until it sends their entryUUID.
const b2bDeleted = z.looseObject({
  organizationId: z.string().min(1).optional(),
  uuid: z.uuid().optional(),
  internalEmail: z.email().optional()
})

const b2cDeleted = z.looseObject({ uuid: z.uuid().optional() })

async function userIdByEmail(tx: Tx, email: string) {
  const [member] = await tx
    .select({ userId: boardMembers.userId })
    .from(boardMembers)
    .where(eq(boardMembers.email, email))
    .union(
      tx
        .select({ userId: spaceMembers.userId })
        .from(spaceMembers)
        .where(eq(spaceMembers.email, email))
    )
    .limit(1)
  return member?.userId
}

// A board whose only admin leaves goes to its oldest editor, or is deleted.
async function handOnBoards(tx: Tx, userId: string) {
  const otherAdmin = alias(boardMembers, 'other_admin')
  const orphaned = await tx
    .select({ boardId: boardMembers.boardId })
    .from(boardMembers)
    .where(
      and(
        eq(boardMembers.userId, userId),
        eq(boardMembers.role, 'admin'),
        notExists(
          tx
            .select()
            .from(otherAdmin)
            .where(
              and(
                eq(otherAdmin.boardId, boardMembers.boardId),
                eq(otherAdmin.role, 'admin'),
                ne(otherAdmin.userId, userId)
              )
            )
        )
      )
    )
  for (const { boardId } of orphaned) {
    const [editor] = await tx
      .select({ userId: boardMembers.userId })
      .from(boardMembers)
      .where(
        and(eq(boardMembers.boardId, boardId), eq(boardMembers.role, 'editor'))
      )
      .orderBy(asc(boardMembers.joinedAt))
      .limit(1)
    if (editor) {
      await tx
        .update(boardMembers)
        .set({ role: 'admin' })
        .where(
          and(
            eq(boardMembers.boardId, boardId),
            eq(boardMembers.userId, editor.userId)
          )
        )
    } else {
      await tx.delete(boards).where(eq(boards.id, boardId))
    }
  }
}

// Runs as the user, so a B2C tenant shows the boards they belong to; their
// memberships go last, since they are what makes those boards visible.
async function forget(tx: Tx, organizationId: string | null, userId: string) {
  await asTenant(tx, { organizationId, userId, email: '' })
  await tx.delete(spaceMembers).where(eq(spaceMembers.userId, userId))
  await tx.delete(taskAssignees).where(eq(taskAssignees.userId, userId))
  await tx
    .delete(boards)
    .where(and(eq(boards.ownerId, userId), eq(boards.inbox, true)))
  await handOnBoards(tx, userId)
  await tx.delete(boardMembers).where(eq(boardMembers.userId, userId))
}

const onB2bDeleted: Handler<PlatformEvent> = async (event, tx) => {
  const account = parseOrDrop(b2bDeleted, event.body, event.routingKey)
  if (!account.organizationId) {
    throw new RejectedEventError('no organizationId')
  }
  if (!account.uuid && !account.internalEmail) {
    throw new RejectedEventError('no uuid or internalEmail')
  }
  await asOrganization(tx, account.organizationId)
  const userId =
    account.uuid ??
    (account.internalEmail
      ? await userIdByEmail(tx, account.internalEmail)
      : undefined)
  if (userId) await forget(tx, account.organizationId, userId)
}

const onB2cDeleted: Handler<PlatformEvent> = async (event, tx) => {
  const account = parseOrDrop(b2cDeleted, event.body, event.routingKey)
  if (!account.uuid) throw new RejectedEventError('no uuid')
  await forget(tx, null, account.uuid)
}

export const accountRoutes: ReadonlyMap<
  string,
  Handler<PlatformEvent>
> = new Map([
  ['domain.user.deleted', onB2bDeleted],
  ['user.deleted', onB2cDeleted]
])
