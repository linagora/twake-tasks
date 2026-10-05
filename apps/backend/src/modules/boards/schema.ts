import { sql, type SQL } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  integer,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn
} from 'drizzle-orm/pg-core'
import {
  currentUser,
  organizationId,
  sortKey,
  tenant,
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
    ownerId: uuid('owner_id'),
    name: text().notNull(),
    keyPrefix: text('key_prefix').notNull(),
    taskCounter: integer('task_counter').notNull().default(0),
    version: bigint({ mode: 'number' }).notNull().default(0),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    archivedAt: timestamptz('archived_at'),
    inbox: boolean().notNull().default(false),
    tenant: tenant()
  },
  table => [
    unique().on(table.tenant, table.id),
    unique().on(table.spaceId, table.keyPrefix),
    // Row level security splits a person's boards by organization, B2C included.
    unique()
      .on(table.organizationId, table.ownerId, table.keyPrefix)
      .nullsNotDistinct(),
    uniqueIndex('boards_one_inbox_per_owner')
      .on(sql`coalesce(${table.organizationId}, '')`, table.ownerId)
      .where(sql`${table.inbox}`),
    foreignKey({
      columns: [table.organizationId, table.spaceId],
      foreignColumns: [spaces.organizationId, spaces.id]
    }),
    check(
      'boards_space_or_owner',
      sql`(${table.spaceId} is null) <> (${table.ownerId} is null)`
    ),
    check(
      'boards_space_has_organization',
      sql`${table.spaceId} is null or ${table.organizationId} is not null`
    ),
    check(
      'boards_key_prefix',
      sql`${table.keyPrefix} ~ '^[A-Z][A-Z0-9]{0,9}$'`
    ),
    tenantPolicy(
      table.organizationId,
      sql`${table.ownerId} = ${currentUser} or ${table.id} = any((select app_member_board_ids())::uuid[])`
    )
  ]
)

// The boards policy applies inside the subquery: a B2C row is visible when its board is.
const visibleBoard = (boardId: AnyPgColumn): SQL =>
  sql`exists (select 1 from ${boards} where ${boards.id} = ${boardId})`

export const boardMembers = pgTable.withRLS(
  'board_members',
  {
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    userId: uuid('user_id').notNull(),
    email: text().notNull(),
    role: memberRole().notNull(),
    tenant: tenant()
  },
  table => [
    primaryKey({ columns: [table.boardId, table.userId] }),
    foreignKey({
      columns: [table.tenant, table.boardId],
      foreignColumns: [boards.tenant, boards.id]
    }),
    // The flag is on while app_member_board_ids reads this table (see its migration).
    tenantPolicy(
      table.organizationId,
      sql`current_setting('app.membership_lookup', true) = 'on' or ${visibleBoard(table.boardId)}`
    )
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
    position: sortKey().notNull(),
    tenant: tenant()
  },
  table => [
    unique().on(table.boardId, table.id),
    unique().on(table.boardId, table.position),
    foreignKey({
      columns: [table.tenant, table.boardId],
      foreignColumns: [boards.tenant, boards.id]
    }),
    tenantPolicy(table.organizationId, visibleBoard(table.boardId))
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
    parentId: uuid('parent_id'),
    organizationId: organizationId(),
    number: integer().notNull(),
    title: text().notNull(),
    description: text().notNull().default(''),
    descriptionText: text('description_text').notNull().default(''),
    descriptionVersion: integer('description_version').notNull().default(0),
    priority: smallint(),
    dueDate: date('due_date', { mode: 'string' }),
    position: sortKey().notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    completedAt: timestamptz('completed_at'),
    canceledAt: timestamptz('canceled_at'),
    tenant: tenant()
  },
  table => [
    unique().on(table.tenant, table.id),
    unique().on(table.boardId, table.id),
    unique().on(table.boardId, table.number),
    // Tasks without a section share one order on the board, and sub-tasks one
    // order under their parent.
    unique()
      .on(table.boardId, table.parentId, table.sectionId, table.position)
      .nullsNotDistinct(),
    foreignKey({
      columns: [table.boardId, table.sectionId],
      foreignColumns: [sections.boardId, sections.id]
    }),
    foreignKey({
      columns: [table.boardId, table.parentId],
      foreignColumns: [table.boardId, table.id]
    }).onDelete('cascade'),
    check(
      'tasks_subtask_outside_sections',
      sql`${table.parentId} is null or ${table.sectionId} is null`
    ),
    foreignKey({
      columns: [table.tenant, table.boardId],
      foreignColumns: [boards.tenant, boards.id]
    }),
    check('tasks_priority', sql`${table.priority} between 1 and 4`),
    tenantPolicy(table.organizationId, visibleBoard(table.boardId))
  ]
)

export const taskAssignees = pgTable.withRLS(
  'task_assignees',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    userId: uuid('user_id').notNull(),
    tenant: tenant()
  },
  table => [
    primaryKey({ columns: [table.taskId, table.userId] }),
    foreignKey({
      columns: [table.tenant, table.taskId],
      foreignColumns: [tasks.tenant, tasks.id]
    }),
    tenantPolicy(
      table.organizationId,
      sql`exists (select 1 from ${tasks} where ${tasks.id} = ${table.taskId})`
    )
  ]
)

export const boardFavorites = pgTable.withRLS(
  'board_favorites',
  {
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    userId: uuid('user_id').notNull(),
    tenant: tenant()
  },
  table => [
    primaryKey({ columns: [table.userId, table.boardId] }),
    foreignKey({
      columns: [table.tenant, table.boardId],
      foreignColumns: [boards.tenant, boards.id]
    }),
    tenantPolicy(table.organizationId, visibleBoard(table.boardId)),
    pgPolicy('own', {
      as: 'restrictive',
      using: sql`${table.userId} = ${currentUser}`,
      withCheck: sql`${table.userId} = ${currentUser}`
    })
  ]
)
