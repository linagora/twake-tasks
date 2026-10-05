import { eq, isNull, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import { asOrganization, type Db, type Tx } from '../../infra/db.ts'
import type { LdapRest } from '../../infra/ldapRest.ts'
import { schedule, type Handler } from '../../scheduler/scheduler.ts'
import { jobs } from '../../scheduler/schema.ts'
import { enqueue } from '../../events/outbox.ts'
import {
  deleteSpace,
  provisioned,
  provisionSpace,
  removeMembers,
  upsertMembers
} from './events.ts'
import { spaceMembers, spaces } from './schema.ts'

export const RECONCILE_SPACES_JOB = 'reconcile-spaces'
export const RECONCILE_SPACE_JOB = 'reconcile-space'

const DAY_MS = 24 * 60 * 60 * 1000

const spaceJob = z.object({
  organizationId: z.string().min(1),
  spaceId: z.uuid()
})

/** Runs the first reconcile now, unless one is already planned. */
export async function planReconcile(db: Db): Promise<void> {
  await db
    .insert(jobs)
    .values({
      kind: RECONCILE_SPACES_JOB,
      key: RECONCILE_SPACES_JOB,
      payload: {},
      runAt: new Date()
    })
    .onConflictDoNothing()
}

async function localSpaceIds(tx: Tx, organizationId: string) {
  await asOrganization(tx, organizationId)
  const rows = await tx
    .select({ id: spaces.id })
    .from(spaces)
    .where(isNull(spaces.deletedAt))
  return rows.map(row => row.id)
}

// Each space is repaired by its own job, so one failing space retries alone.
export function reconcileSpaces(ldapRest: LdapRest): Handler {
  return async (_payload, tx) => {
    for (const organizationId of await ldapRest.organizations()) {
      const ids = new Set([
        ...(await ldapRest.spaceIds(organizationId)),
        ...(await localSpaceIds(tx, organizationId))
      ])
      for (const spaceId of ids) {
        await schedule(tx, {
          kind: RECONCILE_SPACE_JOB,
          key: `${RECONCILE_SPACE_JOB}:${spaceId}`,
          payload: { organizationId, spaceId },
          runAt: new Date()
        })
      }
    }
    await schedule(tx, {
      kind: RECONCILE_SPACES_JOB,
      key: RECONCILE_SPACES_JOB,
      payload: {},
      runAt: new Date(Date.now() + DAY_MS)
    })
    return 'keep'
  }
}

export function reconcileSpace(ldapRest: LdapRest): Handler {
  return async (payload, tx) => {
    const job = spaceJob.parse(payload)
    const ref = { organizationId: job.organizationId, id: job.spaceId }
    const remote = await ldapRest.space(job.organizationId, job.spaceId)
    await asOrganization(tx, job.organizationId)
    if (!remote) {
      await deleteSpace(tx, ref)
      return undefined
    }
    if (await provisionSpace(tx, { ...ref, name: remote.name })) {
      await enqueue(tx, ref.id, provisioned(ref))
    }
    await tx
      .update(spaces)
      .set({ name: remote.name })
      .where(eq(spaces.id, ref.id))
    await upsertMembers(tx, ref, remote.members)
    await removeMembers(
      tx,
      ref,
      remote.members.length === 0
        ? undefined
        : notInArray(
            spaceMembers.userId,
            remote.members.map(m => m.uuid)
          )
    )
    return undefined
  }
}

export const reconcileJobs = (ldapRest: LdapRest): Record<string, Handler> => ({
  [RECONCILE_SPACES_JOB]: reconcileSpaces(ldapRest),
  [RECONCILE_SPACE_JOB]: reconcileSpace(ldapRest)
})
