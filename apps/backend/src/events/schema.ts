import {
  bigint,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text
} from 'drizzle-orm/pg-core'
import { timestamptz } from '../infra/db.ts'

// Read by the relay across organizations, so outside row level security.
export const outbox = pgTable(
  'outbox',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    event: jsonb().notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    sentAt: timestamptz('sent_at')
  },
  table => [index().on(table.sentAt, table.id)]
)

export const processedEvents = pgTable(
  'processed_events',
  {
    consumer: text().notNull(),
    source: text().notNull(),
    id: text().notNull(),
    processedAt: timestamptz('processed_at').notNull().defaultNow()
  },
  table => [primaryKey({ columns: [table.consumer, table.source, table.id] })]
)

// When an organization, a space or a person was deleted, kept forever so a late
// event cannot bring them back. Read across organizations, so outside row level
// security.
export const lastChanges = pgTable('last_changes', {
  object: text().primaryKey(),
  at: timestamptz('at').notNull()
})

// Events about a space not known yet, set aside so the queue goes on. Retried
// across organizations, so outside row level security.
export const parkedEvents = pgTable(
  'parked_events',
  {
    messageId: text('message_id').primaryKey(),
    exchange: text().notNull(),
    routingKey: text('routing_key').notNull(),
    body: jsonb().notNull(),
    reason: text().notNull(),
    parkedAt: timestamptz('parked_at').notNull().defaultNow()
  },
  table => [index().on(table.parkedAt)]
)
