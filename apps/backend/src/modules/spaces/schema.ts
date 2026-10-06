import { sql } from 'drizzle-orm'
import {
  foreignKey,
  pgPolicy,
  pgTable,
  unique,
  uuid
} from 'drizzle-orm/pg-core'
import { organizationId, tenantPolicy, timestamptz } from '../../infra/db.ts'
import { projects } from '../boards/schema.ts'

// The space integration's own table: the project it keeps for each space.
export const spaces = pgTable.withRLS(
  'spaces',
  {
    id: uuid().primaryKey(),
    organizationId: organizationId().notNull(),
    projectId: uuid('project_id').notNull(),
    lastEventAt: timestamptz('last_event_at')
  },
  table => [
    unique().on(table.projectId),
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.tenant, projects.id]
    }).onDelete('cascade'),
    tenantPolicy(table.organizationId),
    // Lets the startup check see whether any organization has a space.
    pgPolicy('space_lookup', {
      for: 'select',
      using: sql`current_setting('app.space_lookup', true) = 'on'`
    })
  ]
)
