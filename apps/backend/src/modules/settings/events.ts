import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { PlatformEvent } from '../../events/envelope.ts'
import { parseOrDrop, type Handler } from '../../events/router.ts'
import type { Tx } from '../../infra/db.ts'
import { SETTINGS_CHANNEL } from './live.ts'
import { theme, userSettings } from './schema.ts'

const optional = <T extends z.ZodType>(schema: T) =>
  schema.nullish().catch(null)

const settings = z.looseObject({
  email: z.email().transform(email => email.toLowerCase()),
  language: optional(z.string().min(1)),
  timezone: optional(z.string().min(1)),
  theme: optional(z.enum(theme.enumValues)),
  avatar: optional(z.string().min(1)),
  first_name: optional(z.string()),
  last_name: optional(z.string()),
  display_name: optional(z.string())
})

type Settings = z.output<typeof settings>

const settingsUpdated = z.looseObject({
  version: z.int().nonnegative(),
  payload: settings
})

function nameOf(person: Settings): string | null {
  const full = [person.first_name, person.last_name]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(' ')
  return person.display_name?.trim() || full || null
}

/** Keeps the settings unless the ones held are as new. */
export async function keepSettings(
  tx: Tx,
  version: number,
  person: Settings
): Promise<void> {
  const row = {
    email: person.email,
    version,
    language: person.language ?? null,
    timezone: person.timezone ?? null,
    theme: person.theme ?? null,
    avatar: person.avatar ?? null,
    name: nameOf(person)
  }
  const kept = await tx
    .insert(userSettings)
    .values(row)
    .onConflictDoUpdate({
      target: userSettings.email,
      set: row,
      setWhere: sql`${userSettings.version} < excluded.version`
    })
    .returning({ email: userSettings.email })
  // Sent on commit, to the replicas streaming this person's settings.
  if (kept.length > 0)
    await tx.execute(
      sql`select pg_notify(${SETTINGS_CHANNEL}, ${`${row.email} ${String(version)}`})`
    )
}

// Each message carries all the settings after a change.
const onUpdated: Handler<PlatformEvent> = async (event, tx) => {
  const update = parseOrDrop(settingsUpdated, event.body, event.routingKey)
  await keepSettings(tx, update.version, update.payload)
}

export const settingsRoutes: ReadonlyMap<
  string,
  Handler<PlatformEvent>
> = new Map([['user.settings.updated', onUpdated]])
