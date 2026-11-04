import type { NotificationKind } from '@twake-tasks/api-contract'
import { integer, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core'

export const theme = pgEnum('theme', ['light', 'dark', 'auto'])

export const emailFrequency = pgEnum('email_frequency', [
  'instant',
  'daily',
  'never'
])

// Each person's own, in every organization they belong to, and read by the
// email jobs and the notifications trigger across organizations, so outside
// row level security like the settings above. No row means every kind is on.
export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid('user_id').primaryKey(),
  mutedInApp: text('muted_in_app')
    .$type<NotificationKind>()
    .array()
    .notNull()
    .default([]),
  mutedEmail: text('muted_email')
    .$type<NotificationKind>()
    .array()
    .notNull()
    .default([]),
  emailFrequency: emailFrequency('email_frequency')
    .notNull()
    .default('instant'),
  // Proves an unsubscribe link came from an email sent to this person.
  unsubscribeToken: uuid('unsubscribe_token').notNull().unique().defaultRandom()
})

// A person's Twake Workplace settings follow them across organizations, so
// they sit outside row level security, keyed by email as common settings is.
export const userSettings = pgTable('user_settings', {
  email: text().primaryKey(),
  version: integer().notNull(),
  language: text(),
  timezone: text(),
  theme: theme(),
  avatar: text(),
  name: text()
})
