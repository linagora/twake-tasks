import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  date,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uuid
} from 'drizzle-orm/pg-core'
import {
  organizationId,
  sortKey,
  tenantPolicy,
  timestamptz
} from '../../infra/db.ts'
import { memberRole, spaces } from '../spaces/schema.ts'

export const sectionCategory = pgEnum('section_category', [
  'backlog',
  'unstarted',
  'started',
  'completed',
  'canceled'
])

const id = () =>
  uuid()
    .primaryKey()
    .default(sql`uuidv7()`)

export const boards = pgTable.withRLS(
  'boards',
  {
    id: id(),
    organizationId: organizationId(),
    spaceId: uuid('space_id'),
    ownerEmail: text('owner_email'),
    name: text().notNull(),
    keyPrefix: text('key_prefix').notNull(),
    taskCounter: integer('task_counter').notNull().default(0),
    version: bigint({ mode: 'number' }).notNull().default(0),
    createdBy: text('created_by').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    archivedAt: timestamptz('archived_at')
  },
  table => [
    unique().on(table.organizationId, table.id),
    unique().on(table.spaceId, table.keyPrefix),
    unique().on(table.ownerEmail, table.keyPrefix),
    foreignKey({
      columns: [table.organizationId, table.spaceId],
      foreignColumns: [spaces.organizationId, spaces.id]
    }),
    check(
      'boards_space_or_owner',
      sql`(${table.spaceId} is null) <> (${table.ownerEmail} is null)`
    ),
    check(
      'boards_space_has_organization',
      sql`${table.spaceId} is null or ${table.organizationId} is not null`
    ),
    check(
      'boards_key_prefix',
      sql`${table.keyPrefix} ~ '^[A-Z][A-Z0-9]{0,9}$'`
    ),
    tenantPolicy(table.organizationId)
  ]
)

export const boardMembers = pgTable.withRLS(
  'board_members',
  {
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    email: text().notNull(),
    role: memberRole().notNull()
  },
  table => [
    primaryKey({ columns: [table.boardId, table.email] }),
    foreignKey({
      columns: [table.organizationId, table.boardId],
      foreignColumns: [boards.organizationId, boards.id]
    }),
    tenantPolicy(table.organizationId)
  ]
)

export const sections = pgTable.withRLS(
  'sections',
  {
    id: id(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    name: text().notNull(),
    category: sectionCategory().notNull(),
    position: sortKey().notNull()
  },
  table => [
    unique().on(table.boardId, table.id),
    unique().on(table.boardId, table.position),
    foreignKey({
      columns: [table.organizationId, table.boardId],
      foreignColumns: [boards.organizationId, boards.id]
    }),
    tenantPolicy(table.organizationId)
  ]
)

export const tasks = pgTable.withRLS(
  'tasks',
  {
    id: id(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id'),
    organizationId: organizationId(),
    number: integer().notNull(),
    title: text().notNull(),
    priority: smallint(),
    dueDate: date('due_date', { mode: 'string' }),
    position: sortKey().notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    completedAt: timestamptz('completed_at'),
    canceledAt: timestamptz('canceled_at')
  },
  table => [
    unique().on(table.organizationId, table.id),
    unique().on(table.boardId, table.number),
    // Tasks without a section share one order on the board.
    unique()
      .on(table.boardId, table.sectionId, table.position)
      .nullsNotDistinct(),
    foreignKey({
      columns: [table.boardId, table.sectionId],
      foreignColumns: [sections.boardId, sections.id]
    }),
    foreignKey({
      columns: [table.organizationId, table.boardId],
      foreignColumns: [boards.organizationId, boards.id]
    }),
    check('tasks_priority', sql`${table.priority} between 1 and 4`),
    tenantPolicy(table.organizationId)
  ]
)

export const taskAssignees = pgTable.withRLS(
  'task_assignees',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    email: text().notNull()
  },
  table => [
    primaryKey({ columns: [table.taskId, table.email] }),
    foreignKey({
      columns: [table.organizationId, table.taskId],
      foreignColumns: [tasks.organizationId, tasks.id]
    }),
    tenantPolicy(table.organizationId)
  ]
)

export const boardFavorites = pgTable.withRLS(
  'board_favorites',
  {
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    email: text().notNull()
  },
  table => [
    primaryKey({ columns: [table.email, table.boardId] }),
    foreignKey({
      columns: [table.organizationId, table.boardId],
      foreignColumns: [boards.organizationId, boards.id]
    }),
    tenantPolicy(table.organizationId)
  ]
)
