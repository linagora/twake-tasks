import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uuid
} from 'drizzle-orm/pg-core'
import {
  currentUser,
  id,
  organizationId,
  ownRows,
  tenantPolicy,
  timestamptz
} from '../../infra/db.ts'

export const savedFilters = pgTable.withRLS(
  'saved_filters',
  {
    id: id(),
    organizationId: organizationId(),
    userId: uuid('user_id').notNull(),
    name: text().notNull(),
    criteria: jsonb().notNull(),
    favorite: boolean().notNull().default(false),
    createdAt: timestamptz('created_at').notNull().defaultNow()
  },
  table => [
    index().on(table.userId),
    tenantPolicy(table.organizationId, sql`${table.userId} = ${currentUser}`),
    // No board cascades to saved filters, so the erase of an organization
    // reaches every person's through this flag; the tenant policy still keeps
    // it to that organization.
    ownRows(
      table.userId,
      sql`current_setting('app.erasing_organization', true) = 'on'`
    )
  ]
)

export const calendarFeedScope = pgEnum('calendar_feed_scope', [
  'assigned',
  'mine'
])

// A calendar fetches the feed without a session, so the token is looked up
// before any tenant is known: outside row level security, like the settings.
// The feed then reads the tasks as its owner, in the organization kept here.
export const calendarFeeds = pgTable('calendar_feeds', {
  userId: uuid('user_id').primaryKey(),
  organizationId: organizationId(),
  email: text().notNull(),
  // The SHA-256 of the token, which only the person's link holds.
  tokenHash: text('token_hash').notNull().unique(),
  scope: calendarFeedScope().notNull().default('assigned'),
  createdAt: timestamptz('created_at').notNull().defaultNow()
})
