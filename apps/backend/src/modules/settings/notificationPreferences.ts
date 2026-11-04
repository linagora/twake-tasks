import type {
  NotificationKind,
  notificationPreferences as wire
} from '@twake-tasks/api-contract'
import { eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { Db, Tx } from '../../infra/db.ts'
import { notificationPreferences as preferences } from './schema.ts'

// The same mapping as skip_muted_notification in the migrations.
export function notificationKind(
  reason: string,
  commented: boolean
): NotificationKind {
  switch (reason) {
    case 'assigned':
    case 'unassigned':
      return 'assigned'
    case 'mentioned':
      return 'mentioned'
    case 'reminder':
      return 'reminder'
    default:
      return commented ? 'comments' : 'changes'
  }
}

const shown = {
  mutedInApp: preferences.mutedInApp,
  mutedEmail: preferences.mutedEmail,
  emailFrequency: preferences.emailFrequency
}

type Preferences = z.infer<typeof wire>

const DEFAULTS: Preferences = {
  mutedInApp: [],
  mutedEmail: [],
  emailFrequency: 'instant'
}

export async function preferencesOf(
  db: Db | Tx,
  userId: string
): Promise<Preferences> {
  const [row] = await db
    .select(shown)
    .from(preferences)
    .where(eq(preferences.userId, userId))
  return row ?? DEFAULTS
}

// A kind off in the app is off by email too, whatever was kept for it.
export async function keepPreferences(
  db: Db,
  userId: string,
  kept: Preferences
): Promise<Preferences> {
  const value = {
    ...kept,
    mutedEmail: [...new Set([...kept.mutedEmail, ...kept.mutedInApp])]
  }
  const [row] = await db
    .insert(preferences)
    .values({ userId, ...value })
    .onConflictDoUpdate({ target: preferences.userId, set: value })
    .returning(shown)
  return row ?? value
}

/** The person's token for the links of their emails, made on first use. */
export async function unsubscribeTokenOf(
  tx: Tx,
  userId: string
): Promise<string> {
  const [found] = await tx
    .select({ token: preferences.unsubscribeToken })
    .from(preferences)
    .where(eq(preferences.userId, userId))
  if (found) return found.token
  const [row] = await tx
    .insert(preferences)
    .values({ userId })
    .onConflictDoUpdate({
      target: preferences.userId,
      set: { userId: sql`excluded.user_id` }
    })
    .returning({ token: preferences.unsubscribeToken })
  if (!row) throw new Error('notification preferences row missing')
  return row.token
}

/** False when no email was sent with that token. */
export async function unsubscribe(
  db: Db,
  token: string,
  kind: NotificationKind | 'all'
): Promise<boolean> {
  const rows = await db
    .update(preferences)
    .set(
      kind === 'all'
        ? { emailFrequency: 'never' }
        : {
            mutedEmail: sql`array(select distinct unnest(array_append(${preferences.mutedEmail}, ${kind}::text)))`
          }
    )
    .where(eq(preferences.unsubscribeToken, token))
    .returning({ userId: preferences.userId })
  return rows.length > 0
}
