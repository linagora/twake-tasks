import { eq, inArray, or, sql } from 'drizzle-orm'
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
import {
  eraseOrganization,
  forgetPerson,
  projectMembers
} from '../boards/index.ts'
import { commentReactions } from '../collaboration/index.ts'
import { inviteEmails } from '../projects/index.ts'
import { userSettings } from '../settings/index.ts'
import { spaces } from '../spaces/index.ts'
import { eraseSavedFilters, savedFilters } from '../views/index.ts'

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

interface Person {
  userId: string | undefined
  email: string | undefined
}

// Found by uuid and email, not through memberships, which are gone once the
// organization's deletion ran first.
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
    // Before forgetPerson ends the memberships that show B2C comments.
    await tx.delete(commentReactions).where(eq(commentReactions.userId, userId))
    await forgetPerson(tx, userId)
    await tx.delete(savedFilters).where(eq(savedFilters.userId, userId))
    await tx.delete(jobs).where(eq(jobs.userId, userId))
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
  await eraseOrganization(tx)
  await eraseSavedFilters(tx)
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
