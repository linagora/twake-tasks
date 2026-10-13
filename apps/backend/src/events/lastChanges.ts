import { inArray, sql } from 'drizzle-orm'
import type { Tx } from '../infra/db.ts'
import { lastChanges } from './schema.ts'

export const deletedOrganizationKey = (id: string) =>
  `organization:${id}:deleted`
export const deletedSpaceKey = (id: string) => `space:${id}:deleted`
export const deletedUserKey = (uuid: string) => `user:${uuid}:deleted`
// An email can be given to a new person later, so its marker only holds back
// older events.
export const deletedEmailKey = (email: string) =>
  `email:${email.toLowerCase()}:deleted`

const ORGANIZATION_LOCK = 0x6f726720

// Space events take it shared and an organization's deletion exclusive, so a
// space cannot be created while its organization is being erased, unseen by
// the erasing.
export async function lockOrganization(
  tx: Tx,
  organizationId: string,
  mode: 'shared' | 'exclusive'
): Promise<void> {
  const key = sql`${ORGANIZATION_LOCK}::int, hashtext(${organizationId})`
  await tx.execute(
    mode === 'shared'
      ? sql`select pg_advisory_xact_lock_shared(${key})`
      : sql`select pg_advisory_xact_lock(${key})`
  )
}

/** Records the deletion of these objects, keeping the latest time of each. */
export async function recordDeletion(
  tx: Tx,
  objects: string[],
  at: Date
): Promise<void> {
  const unique = [...new Set(objects)]
  if (unique.length === 0) return
  await tx
    .insert(lastChanges)
    .values(unique.map(object => ({ object, at })))
    .onConflictDoUpdate({
      target: lastChanges.object,
      set: { at: sql`greatest(${lastChanges.at}, excluded.at)` }
    })
}

/** When each of these objects was deleted, for those that were. */
export async function deletions(
  tx: Tx,
  objects: string[]
): Promise<Map<string, Date>> {
  if (objects.length === 0) return new Map()
  const rows = await tx
    .select()
    .from(lastChanges)
    .where(inArray(lastChanges.object, objects))
  return new Map(rows.map(row => [row.object, row.at]))
}
