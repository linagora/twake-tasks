import { sql } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { timestamptz } from '../infra/db.ts'
import { tasks } from '../modules/boards/schema.ts'

// Read by the scheduler across organizations, so outside row level security.
// A handler runs its work as the tenant its payload names.
export const jobs = pgTable(
  'jobs',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    kind: text().notNull(),
    key: text().unique(),
    payload: jsonb().notNull(),
    taskId: uuid('task_id').references(() => tasks.id, {
      onDelete: 'cascade'
    }),
    userId: uuid('user_id'),
    runAt: timestamptz('run_at').notNull(),
    attempts: integer().notNull().default(0),
    lastError: text('last_error'),
    // A column default, so jobs the SQL functions insert carry the request too.
    requestId: uuid('request_id').default(
      sql`cast(nullif(current_setting('app.request_id', true), '') as uuid)`
    ),
    createdAt: timestamptz('created_at').notNull().defaultNow()
  },
  table => [
    index().on(table.kind, table.runAt),
    index().on(table.taskId),
    index().on(table.userId)
  ]
)
