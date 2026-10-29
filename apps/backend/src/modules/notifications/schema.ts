import { boolean, integer, pgTable, uuid } from 'drizzle-orm/pg-core'
import { timestamptz } from '../../infra/db.ts'

// Read by the email jobs across organizations, so outside row level security.
// The notification emails a person got in the current window, and those held
// back past the limit, which a digest then counts.
export const notificationEmailBudgets = pgTable('notification_email_budgets', {
  userId: uuid('user_id').primaryKey(),
  windowStart: timestamptz('window_start').notNull(),
  sent: integer().notNull().default(0),
  held: integer().notNull().default(0),
  digestScheduled: boolean('digest_scheduled').notNull().default(false)
})
