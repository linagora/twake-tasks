import { sql } from 'drizzle-orm'
import {
  foreignKey,
  pgTable,
  primaryKey,
  text,
  uuid
} from 'drizzle-orm/pg-core'
import {
  organizationId,
  tenant,
  tenantPolicy,
  timestamptz
} from '../../infra/db.ts'
import { comments } from '../boards/index.ts'

// One emoji per person per comment can be added once; the comment's task
// decides who sees it, as for the comment.
export const commentReactions = pgTable.withRLS(
  'comment_reactions',
  {
    commentId: uuid('comment_id')
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    userId: uuid('user_id').notNull(),
    userEmail: text('user_email').notNull(),
    emoji: text().notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    tenant: tenant()
  },
  table => [
    primaryKey({ columns: [table.commentId, table.userId, table.emoji] }),
    foreignKey({
      columns: [table.tenant, table.commentId],
      foreignColumns: [comments.tenant, comments.id]
    }),
    tenantPolicy(
      table.organizationId,
      sql`exists (select 1 from ${comments} where ${comments.id} = ${table.commentId})`
    )
  ]
)
