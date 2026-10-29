import { foreignKey, index, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import {
  id,
  organizationId,
  tenant,
  tenantPolicy,
  timestamptz
} from '../../infra/db.ts'
import { projects, visibleProject } from '../boards/index.ts'

// Every invitation e-mail scheduled, to rate limit them: an invite can be
// canceled and made again, and the job queue forgets a job once delivered.
export const inviteEmails = pgTable.withRLS(
  'invite_emails',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    email: text().notNull(),
    invitedBy: uuid('invited_by').notNull(),
    sentAt: timestamptz('sent_at').notNull().defaultNow(),
    tenant: tenant()
  },
  table => [
    index().on(table.projectId, table.email, table.sentAt),
    index().on(table.invitedBy, table.sentAt),
    foreignKey({
      columns: [table.tenant, table.projectId],
      foreignColumns: [projects.tenant, projects.id]
    }),
    tenantPolicy(table.organizationId, visibleProject(table.projectId))
  ]
)
