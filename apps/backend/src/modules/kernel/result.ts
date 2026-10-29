import { inTenant, type Db, type Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'

export type Refusal =
  | 'not_found'
  | 'forbidden'
  | 'archived'
  | 'invalid_section'
  | 'stale_neighbours'
  | 'section_not_empty'
  | 'invalid_assignee'
  | 'stale_version'
  | 'invalid_parent'
  | 'too_deep'
  | 'invalid_label'
  | 'invalid_dates'
  | 'invalid_reminder'
  | 'too_many_mentions'
  | 'too_many_reminders'
  | 'label_taken'
  | 'section_name_taken'
  | 'last_admin'
  | 'key_prefix_taken'
  | 'same_board'
export type Result<T> = { ok: true; value: T } | { ok: false; error: Refusal }

// Thrown, not returned, so the transaction rolls back whatever ran before it.
export class Refused extends Error {
  readonly refusal: Refusal

  constructor(refusal: Refusal) {
    super(refusal)
    this.refusal = refusal
  }
}

export async function writeOrRefuse<T>(
  db: Db,
  identity: Identity,
  work: (tx: Tx) => Promise<T>
): Promise<Result<T>> {
  try {
    return { ok: true, value: await inTenant(db, identity, work) }
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.refusal }
    throw error
  }
}
