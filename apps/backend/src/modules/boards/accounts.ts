import { and, asc, eq, inArray, ne, notExists, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import type { PlatformEvent } from '../../events/envelope.ts'
import {
  deletedEmailKey,
  deletedOrganizationKey,
  deletedUserKey,
  lockOrganization,
  recordDeletion
} from '../../events/lastChanges.ts'
import {
  parseOrDrop,
  RejectedEventError,
  type Handler
} from '../../events/router.ts'
import { asOrganization, asTenant, type Tx } from '../../infra/db.ts'
import { jobs } from '../../scheduler/schema.ts'
import { userSettings } from '../settings/schema.ts'
import { spaces } from '../spaces/schema.ts'
import { bumpProjects } from './access.ts'
import {
  commentReactions,
  inviteEmails,
  notifications,
  projectMembers,
  projects,
  savedFilters,
  taskAssignees,
  taskFollowers
} from './schema.ts'

// An unreadable time must not drop a deletion, which then counts from now.
const timestamp = z.iso
  .datetime({ offset: true })
  .optional()
  .catch(undefined)
  .transform(at => (at === undefined ? new Date() : new Date(at)))

// ldap-rest names B2B users by email until it sends their entryUUID.
const b2bDeleted = z.looseObject({
  organizationId: z.string().min(1).optional(),
  uuid: z.uuid().optional(),
  internalEmail: z.email().optional(),
  timestamp
})

const organizationDeleted = z.looseObject({
  organizationId: z.string().min(1).optional(),
  timestamp
})

const b2cDeleted = z.looseObject({
  uuid: z.uuid().optional(),
  internalEmail: z.email().optional(),
  timestamp
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

interface Person {
  userId: string | undefined
  email: string | undefined
}

// Found by uuid and email, not through memberships, which are gone once the
// organization's deletion ran first. Runs as the user, so a B2C tenant shows
// the projects they belong to; their memberships go last, since they are what
// makes those projects visible.
async function forget(
  tx: Tx,
  organizationId: string | null,
  person: Person,
  at: Date
) {
  const { userId } = person
  await recordDeletion(
    tx,
    [
      ...(userId ? [deletedUserKey(userId)] : []),
      ...(person.email ? [deletedEmailKey(person.email)] : [])
    ],
    at
  )
  await asTenant(tx, { organizationId, userId: userId ?? '', email: '' })
  const emails = [
    ...(person.email ? [person.email.toLowerCase()] : []),
    ...(userId
      ? (
          await tx
            .select({ email: sql<string>`lower(${projectMembers.email})` })
            .from(projectMembers)
            .where(eq(projectMembers.userId, userId))
        ).map(m => m.email)
      : [])
  ]
  await tx.delete(userSettings).where(inArray(userSettings.email, emails))
  await tx
    .delete(inviteEmails)
    .where(
      or(
        userId ? eq(inviteEmails.invitedBy, userId) : undefined,
        inArray(inviteEmails.email, emails)
      )
    )
  if (userId) {
    // While the boards are still visible through a B2C membership.
    await bumpProjects(
      tx,
      (
        await tx
          .select({ projectId: projectMembers.projectId })
          .from(projectMembers)
          .where(eq(projectMembers.userId, userId))
      ).map(m => m.projectId)
    )
    await tx.delete(taskAssignees).where(eq(taskAssignees.userId, userId))
    await tx.delete(taskFollowers).where(eq(taskFollowers.userId, userId))
    await tx.delete(commentReactions).where(eq(commentReactions.userId, userId))
    await tx.delete(notifications).where(eq(notifications.userId, userId))
    await tx.delete(savedFilters).where(eq(savedFilters.userId, userId))
    await tx
      .delete(projects)
      .where(and(eq(projects.createdBy, userId), eq(projects.personal, true)))
    await handOnProjects(tx, userId)
    await tx.delete(projectMembers).where(eq(projectMembers.userId, userId))
  }
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
  await forget(
    tx,
    account.organizationId,
    { userId, email: account.internalEmail },
    account.timestamp
  )
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
  await forget(
    tx,
    null,
    { userId, email: account.internalEmail },
    account.timestamp
  )
}

// May be replayed, and may arrive before its members' domain.user.deleted.
const onOrganizationDeleted: Handler<PlatformEvent> = async (event, tx) => {
  const deleted = parseOrDrop(organizationDeleted, event.body, event.routingKey)
  const { organizationId } = deleted
  if (!organizationId) throw new RejectedEventError('no organizationId')
  await lockOrganization(tx, organizationId, 'exclusive')
  await recordDeletion(
    tx,
    [deletedOrganizationKey(organizationId)],
    deleted.timestamp
  )
  await asOrganization(tx, organizationId)
  // Spaces before projects, the order every space handler locks them in.
  await tx
    .select({ id: spaces.id })
    .from(spaces)
    .orderBy(spaces.id)
    .for('update')
  await tx.execute(
    sql`select set_config('app.erasing_organization', 'on', true)`
  )
  await tx.delete(projects)
  await tx.delete(savedFilters)
  await tx.execute(sql`select set_config('app.erasing_organization', '', true)`)
  await tx
    .delete(jobs)
    .where(sql`${jobs.payload}->>'organizationId' = ${organizationId}`)
}

export const accountRoutes: ReadonlyMap<
  string,
  Handler<PlatformEvent>
> = new Map([
  ['domain.user.deleted', onB2bDeleted],
  ['user.deleted', onB2cDeleted],
  ['domain.organization.deleted', onOrganizationDeleted]
])
