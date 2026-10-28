import { and, eq, like, not } from 'drizzle-orm'
import type { Tx } from '../../infra/db.ts'
import { boards } from './schema.ts'

export const INBOX_KEY_PREFIX = 'INBOX'

const MAX_LENGTH = 10
const MAX_SUFFIX = 999

/**
 * `wanted` when no other board of the organization uses it, else the first
 * free one of WANTED2, WANTED3…, cut to fit in ten characters. Every Inbox
 * uses INBOX, which no other board may take. B2C boards have no organization:
 * their prefix is only unique in their project, which a new board starts.
 */
export async function freeKeyPrefix(
  tx: Tx,
  organizationId: string | null,
  wanted: string
): Promise<string> {
  const taken = new Set([INBOX_KEY_PREFIX])
  if (organizationId !== null) {
    // Every candidate starts with these letters.
    const stem = wanted.slice(0, MAX_LENGTH - String(MAX_SUFFIX).length)
    const rows = await tx
      .select({ keyPrefix: boards.keyPrefix })
      .from(boards)
      .where(
        and(
          eq(boards.organizationId, organizationId),
          not(boards.inbox),
          like(boards.keyPrefix, `${stem}%`)
        )
      )
    for (const row of rows) taken.add(row.keyPrefix)
  }
  if (!taken.has(wanted)) return wanted
  for (let number = 2; number <= MAX_SUFFIX; number++) {
    const suffix = String(number)
    const candidate = wanted.slice(0, MAX_LENGTH - suffix.length) + suffix
    if (!taken.has(candidate)) return candidate
  }
  throw new Error(`no free key prefix after ${wanted}`)
}
