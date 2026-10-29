import { sql } from 'drizzle-orm'
import { boolean, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'
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
