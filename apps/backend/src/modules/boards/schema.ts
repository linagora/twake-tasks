import { sql, type SQL } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
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

export const memberRole = pgEnum('member_role', ['viewer', 'editor', 'admin'])

export const sectionCategory = pgEnum('section_category', [
  'backlog',
  'unstarted',
  'started',
  'completed',
  'canceled'
])

export const durationUnit = pgEnum('duration_unit', ['minutes', 'days'])

export const recurrenceUnit = pgEnum('recurrence_unit', [
  'days',
  'weeks',
  'months',
  'years'
])

export const LAYOUTS = ['board', 'list', 'calendar'] as const

export const boardLayout = pgEnum('board_layout', LAYOUTS)

const id = () =>
  uuid()
    .primaryKey()
    .default(sql`uuidv7()`)

export const projects = pgTable.withRLS(
  'projects',
  {
    id: id(),
    organizationId: organizationId(),
    name: text().notNull(),
    // Holds the person's Inbox, and is never shared.
    personal: boolean().notNull().default(false),
    // Its members come from an integration, such as a space, and are not edited here.
    managed: boolean().notNull().default(false),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    // A deleted project is out of reach until it is purged.
    deletedAt: timestamptz('deleted_at'),
    tenant: tenant()
  },
  table => [
    unique().on(table.tenant, table.id),
    // Row level security splits a person's projects by organization, B2C included.
    uniqueIndex('projects_one_personal_per_user')
      .on(sql`coalesce(${table.organizationId}, '')`, table.createdBy)
      .where(sql`${table.personal}`),
    check(
      'projects_personal_not_managed',
      sql`not (${table.personal} and ${table.managed})`
    ),
    tenantPolicy(
      table.organizationId,
      sql`${table.createdBy} = ${currentUser} or ${table.id} = any((select app_member_project_ids())::uuid[])`
    )
  ]
)

// The projects policy applies inside the subquery: a B2C row is visible when its project is.
const visibleProject = (projectId: AnyPgColumn): SQL =>
  sql`exists (select 1 from ${projects} where ${projects.id} = ${projectId})`

export const projectMembers = pgTable.withRLS(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    userId: uuid('user_id').notNull(),
    email: text().notNull(),
    // From the person's last sign-in: null for someone who never signed in.
    name: text(),
    role: memberRole().notNull(),
    joinedAt: timestamptz('joined_at').notNull().defaultNow(),
    tenant: tenant()
  },
  table => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index().on(table.userId),
    foreignKey({
      columns: [table.tenant, table.projectId],
      foreignColumns: [projects.tenant, projects.id]
    }),
    // The flag is on while app_member_project_ids reads this table (see its migration).
    tenantPolicy(
      table.organizationId,
      sql`current_setting('app.membership_lookup', true) = 'on' or ${visibleProject(table.projectId)}`
    )
  ]
)

// An invite waits for its email to sign in, then app_claim_invites turns it
// into a membership. The organization keeps it inside its tenant.
export const projectInvites = pgTable.withRLS(
  'project_invites',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    email: text().notNull(),
    role: memberRole().notNull(),
    invitedBy: uuid('invited_by').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    tenant: tenant()
  },
  table => [
    unique().on(table.projectId, table.email),
    index().on(table.email),
    foreignKey({
      columns: [table.tenant, table.projectId],
      foreignColumns: [projects.tenant, projects.id]
    }),
    check(
      'project_invites_email_lower',
      sql`${table.email} = lower(${table.email})`
    ),
    tenantPolicy(
      table.organizationId,
      sql`${visibleProject(table.projectId)} or ${table.email} = lower(current_setting('app.user_email', true))`
    )
  ]
)

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

export const boards = pgTable.withRLS(
  'boards',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    name: text().notNull(),
    keyPrefix: text('key_prefix').notNull(),
    taskCounter: integer('task_counter').notNull().default(0),
    version: bigint({ mode: 'number' }).notNull().default(0),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    archivedAt: timestamptz('archived_at'),
    inbox: boolean().notNull().default(false),
    layout: boardLayout().notNull().default('board'),
    tenant: tenant()
  },
  table => [
    unique().on(table.tenant, table.id),
    unique().on(table.projectId, table.keyPrefix),
    index().on(table.projectId),
    uniqueIndex('boards_one_inbox_per_project')
      .on(table.projectId)
      .where(sql`${table.inbox}`),
    foreignKey({
      columns: [table.tenant, table.projectId],
      foreignColumns: [projects.tenant, projects.id]
    }),
    check(
      'boards_key_prefix',
      sql`${table.keyPrefix} ~ '^[A-Z][A-Z0-9]{0,9}$'`
    ),
    tenantPolicy(table.organizationId, visibleProject(table.projectId))
  ]
)

// The boards policy applies inside the subquery: a B2C row is visible when its board is.
const visibleBoard = (boardId: AnyPgColumn): SQL =>
  sql`exists (select 1 from ${boards} where ${boards.id} = ${boardId})`

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
    // Keys the task had on boards it was moved from, so search still finds it.
    previousKeys: text('previous_keys').array().notNull().default([]),
    title: text().notNull(),
    description: text().notNull().default(''),
    descriptionText: text('description_text').notNull().default(''),
    descriptionVersion: integer('description_version').notNull().default(0),
    priority: smallint(),
    dueDate: date('due_date', { mode: 'string' }),
    dueTime: time('due_time', { precision: 0 }),
    // Without a zone, the time is the same wall clock time everywhere.
    dueZone: text('due_zone'),
    deadline: date({ mode: 'string' }),
    duration: integer(),
    durationUnit: durationUnit('duration_unit'),
    recurEvery: integer('recur_every'),
    recurUnit: recurrenceUnit('recur_unit'),
    // "every!" in quick add: the next date counts from the completion day.
    recurFromCompletion: boolean('recur_from_completion')
      .notNull()
      .default(false),
    position: sortKey().notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    completedAt: timestamptz('completed_at'),
    canceledAt: timestamptz('canceled_at'),
    archivedAt: timestamptz('archived_at'),
    deletedAt: timestamptz('deleted_at'),
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
    check(
      'tasks_due_time_on_a_date',
      sql`${table.dueTime} is null or ${table.dueDate} is not null`
    ),
    check(
      'tasks_due_zone_on_a_time',
      sql`${table.dueZone} is null or ${table.dueTime} is not null`
    ),
    check(
      'tasks_duration',
      sql`(${table.duration} is null) = (${table.durationUnit} is null) and ${table.duration} > 0`
    ),
    check(
      'tasks_recurrence',
      sql`(${table.recurEvery} is null) = (${table.recurUnit} is null) and ${table.recurEvery} > 0`
    ),
    check(
      'tasks_recurrence_on_a_date',
      sql`${table.recurEvery} is null or ${table.dueDate} is not null`
    ),
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

export const labels = pgTable.withRLS(
  'labels',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    name: text().notNull(),
    tenant: tenant()
  },
  table => [
    unique().on(table.tenant, table.id),
    unique().on(table.projectId, table.name),
    foreignKey({
      columns: [table.tenant, table.projectId],
      foreignColumns: [projects.tenant, projects.id]
    }),
    tenantPolicy(table.organizationId, visibleProject(table.projectId))
  ]
)

export const taskLabels = pgTable.withRLS(
  'task_labels',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    tenant: tenant()
  },
  table => [
    primaryKey({ columns: [table.taskId, table.labelId] }),
    foreignKey({
      columns: [table.tenant, table.taskId],
      foreignColumns: [tasks.tenant, tasks.id]
    }),
    foreignKey({
      columns: [table.tenant, table.labelId],
      foreignColumns: [labels.tenant, labels.id]
    }),
    tenantPolicy(
      table.organizationId,
      sql`exists (select 1 from ${tasks} where ${tasks.id} = ${table.taskId})`
    )
  ]
)

export const comments = pgTable.withRLS(
  'comments',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    authorId: uuid('author_id').notNull(),
    authorEmail: text('author_email').notNull(),
    body: text().notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    tenant: tenant()
  },
  table => [
    index().on(table.taskId, table.createdAt),
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

// Written by triggers on tasks, task_assignees and task_labels.
export const taskHistory = pgTable.withRLS(
  'task_history',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    actorId: uuid('actor_id'),
    actorEmail: text('actor_email').notNull(),
    field: text().notNull(),
    from: jsonb(),
    to: jsonb(),
    at: timestamptz('at').notNull().defaultNow(),
    tenant: tenant()
  },
  table => [
    index().on(table.taskId, table.at),
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
    ownRows(table.userId)
  ]
)

export const savedFilters = pgTable.withRLS(
  'saved_filters',
  {
    id: id(),
    organizationId: organizationId(),
    userId: uuid('user_id').notNull(),
    name: text().notNull(),
    criteria: jsonb().notNull(),
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

export const boardLayouts = pgTable.withRLS(
  'board_layouts',
  {
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    userId: uuid('user_id').notNull(),
    layout: boardLayout().notNull(),
    tenant: tenant()
  },
  table => [
    primaryKey({ columns: [table.userId, table.boardId] }),
    foreignKey({
      columns: [table.tenant, table.boardId],
      foreignColumns: [boards.tenant, boards.id]
    }),
    tenantPolicy(table.organizationId, visibleBoard(table.boardId)),
    ownRows(table.userId)
  ]
)

function ownRows(userId: AnyPgColumn, orReach?: SQL) {
  const own = sql`${userId} = ${currentUser}`
  return pgPolicy('own', {
    as: 'restrictive',
    using: orReach ? sql`${own} or ${orReach}` : own,
    withCheck: own
  })
}

const visibleTask = (taskId: AnyPgColumn): SQL =>
  sql`exists (select 1 from ${tasks} where ${tasks.id} = ${taskId})`

// Either at a fixed moment, or some minutes before the due date. A due date
// without a time counts from nine in the morning, and a floating due time in
// the zone of whoever set the reminder.
export const taskReminders = pgTable.withRLS(
  'task_reminders',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    userId: uuid('user_id').notNull(),
    email: text().notNull(),
    at: timestamptz('at'),
    beforeMinutes: integer('before_minutes'),
    zone: text(),
    tenant: tenant()
  },
  table => [
    index().on(table.taskId),
    foreignKey({
      columns: [table.tenant, table.taskId],
      foreignColumns: [tasks.tenant, tasks.id]
    }),
    check(
      'task_reminders_at_or_before',
      sql`(${table.at} is null) <> (${table.beforeMinutes} is null)
        and (${table.beforeMinutes} is null) = (${table.zone} is null)
        and ${table.beforeMinutes} >= 0`
    ),
    tenantPolicy(table.organizationId, visibleTask(table.taskId)),
    ownRows(table.userId)
  ]
)

export const notifications = pgTable.withRLS(
  'notifications',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    organizationId: organizationId(),
    userId: uuid('user_id').notNull(),
    reason: text().notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    readAt: timestamptz('read_at'),
    tenant: tenant()
  },
  table => [
    index().on(table.userId, table.createdAt),
    uniqueIndex()
      .on(table.userId, table.taskId, table.reason)
      .where(sql`${table.readAt} is null`),
    foreignKey({
      columns: [table.tenant, table.taskId],
      foreignColumns: [tasks.tenant, tasks.id]
    }),
    tenantPolicy(table.organizationId, visibleTask(table.taskId)),
    // Anyone who sees the task may notify someone of a change to it.
    ...(['select', 'update', 'delete'] as const).map(command =>
      pgPolicy(`own_${command}`, {
        as: 'restrictive',
        for: command,
        using: sql`${table.userId} = ${currentUser}`
      })
    )
  ]
)

export const taskFollowers = pgTable.withRLS(
  'task_followers',
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
    tenantPolicy(table.organizationId, visibleTask(table.taskId))
  ]
)
