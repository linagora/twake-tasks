import { foreignKey, pgTable, unique, uuid } from 'drizzle-orm/pg-core'
import { organizationId, tenantPolicy } from '../../infra/db.ts'
import { projects } from '../boards/schema.ts'

// The space integration's own table: the project it keeps for each space.
export const spaces = pgTable.withRLS(
  'spaces',
  {
    id: uuid().primaryKey(),
    organizationId: organizationId().notNull(),
    projectId: uuid('project_id').notNull()
  },
  table => [
    unique().on(table.projectId),
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.tenant, projects.id]
    }).onDelete('cascade'),
    tenantPolicy(table.organizationId)
  ]
)
