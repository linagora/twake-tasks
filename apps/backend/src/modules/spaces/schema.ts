import {
  foreignKey,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid
} from 'drizzle-orm/pg-core'
import { organizationId, tenantPolicy, timestamptz } from '../../infra/db.ts'

export const memberRole = pgEnum('member_role', ['viewer', 'editor', 'admin'])

export const spaces = pgTable.withRLS(
  'spaces',
  {
    id: uuid().primaryKey(),
    organizationId: organizationId().notNull(),
    name: text().notNull(),
    deletedAt: timestamptz('deleted_at')
  },
  table => [
    unique().on(table.organizationId, table.id),
    tenantPolicy(table.organizationId)
  ]
)

export const spaceMembers = pgTable.withRLS(
  'space_members',
  {
    spaceId: uuid('space_id').notNull(),
    organizationId: organizationId().notNull(),
    email: text().notNull(),
    role: memberRole().notNull()
  },
  table => [
    primaryKey({ columns: [table.spaceId, table.email] }),
    foreignKey({
      columns: [table.organizationId, table.spaceId],
      foreignColumns: [spaces.organizationId, spaces.id]
    }).onDelete('cascade'),
    tenantPolicy(table.organizationId)
  ]
)
