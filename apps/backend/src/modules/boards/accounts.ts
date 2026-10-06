import { and, asc, eq, ne, notExists, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import type { PlatformEvent } from '../../events/envelope.ts'
import {
  parseOrDrop,
  RejectedEventError,
  type Handler
} from '../../events/router.ts'
import { asOrganization, asTenant, type Tx } from '../../infra/db.ts'
import { projectMembers, projects, taskAssignees } from './schema.ts'

// ldap-rest names B2B users by email until it sends their entryUUID.
const b2bDeleted = z.looseObject({
  organizationId: z.string().min(1).optional(),
  uuid: z.uuid().optional(),
  internalEmail: z.email().optional()
})

const b2cDeleted = z.looseObject({
  uuid: z.uuid().optional(),
  internalEmail: z.email().optional()
})

// A B2C membership is visible only to its own user, so finding one by email
// takes the lookup flag the membership policy honours. Goes once ldap-rest
// sends the uuid in user.deleted.
async function b2cUserIdByEmail(tx: Tx, email: string) {
  await asOrganization(tx, null)
  await tx.execute(sql`select set_config('app.membership_lookup', 'on', true)`)
  const userId = await userIdByEmail(tx, email)
  await tx.execute(sql`select set_config('app.membership_lookup', '', true)`)
  return userId
}

async function userIdByEmail(tx: Tx, email: string) {
  const [member] = await tx
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(eq(projectMembers.email, email))
    .limit(1)
  return member?.userId
}

// A project whose only admin leaves goes to its oldest editor, or is deleted.
// A managed project's members come from its integration, so it is left alone.
async function handOnProjects(tx: Tx, userId: string) {
  const otherAdmin = alias(projectMembers, 'other_admin')
  const orphaned = await tx
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(
      and(
        eq(projectMembers.userId, userId),
        eq(projectMembers.role, 'admin'),
        eq(projects.managed, false),
        notExists(
          tx
            .select()
            .from(otherAdmin)
            .where(
              and(
                eq(otherAdmin.projectId, projectMembers.projectId),
                eq(otherAdmin.role, 'admin'),
                ne(otherAdmin.userId, userId)
              )
            )
        )
      )
    )
  for (const { projectId } of orphaned) {
    const [editor] = await tx
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.role, 'editor')
        )
      )
      .orderBy(asc(projectMembers.joinedAt))
      .limit(1)
    if (editor) {
      await tx
        .update(projectMembers)
        .set({ role: 'admin' })
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, editor.userId)
          )
        )
    } else {
      await tx.delete(projects).where(eq(projects.id, projectId))
    }
  }
}

// Runs as the user, so a B2C tenant shows the projects they belong to; their
// memberships go last, since they are what makes those projects visible.
async function forget(tx: Tx, organizationId: string | null, userId: string) {
  await asTenant(tx, { organizationId, userId, email: '' })
  await tx.delete(taskAssignees).where(eq(taskAssignees.userId, userId))
  await tx
    .delete(projects)
    .where(and(eq(projects.createdBy, userId), eq(projects.personal, true)))
  await handOnProjects(tx, userId)
  await tx.delete(projectMembers).where(eq(projectMembers.userId, userId))
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
  if (!account.uuid && !account.internalEmail) {
    throw new RejectedEventError('no uuid or internalEmail')
  }
  const userId =
    account.uuid ??
    (account.internalEmail
      ? await b2cUserIdByEmail(tx, account.internalEmail)
      : undefined)
  if (userId) await forget(tx, null, userId)
}

export const accountRoutes: ReadonlyMap<
  string,
  Handler<PlatformEvent>
> = new Map([
  ['domain.user.deleted', onB2bDeleted],
  ['user.deleted', onB2cDeleted]
])
