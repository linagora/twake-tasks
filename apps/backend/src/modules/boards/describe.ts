import { and, isNull, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { currentUser, type Tx } from '../../infra/db.ts'
import type { Member } from './access.ts'
import { recurrenceOf } from './recurrence.ts'
import { boards, tasks } from './schema.ts'

export const shown = and(isNull(tasks.archivedAt), isNull(tasks.deletedAt))

// One parameter whatever the number of ids: Drizzle builds `in (...)` id by
// id, which costs more than the query on a large board.
const anyOf = (column: AnyPgColumn, ids: string[]) =>
  sql`${column} = any(${sql.param(ids)}::uuid[])`

interface Blocker {
  open: boolean
  keyPrefix: string
  number: number
  title: string
}

// Read with the task so a list of tasks costs one statement. Drizzle leaves
// the columns of a query on `tasks` alone unqualified, so the subqueries name
// `tasks.id` themselves. A blocker on a board the person cannot open is not
// `open`, which row level security alone does not hide in an organization.
export const describedExtras = {
  assigneeIds: sql<string[]>`coalesce((
    select json_agg(a.user_id) from task_assignees a
    where a.task_id = tasks.id), '[]')`,
  labelIds: sql<string[]>`coalesce((
    select json_agg(l.label_id) from task_labels l
    where l.task_id = tasks.id), '[]')`,
  commentCount: sql<number>`(
    select count(*)::int from comments c where c.task_id = tasks.id)`,
  template: sql<{ id: string; title: string; projectId: string } | null>`(
    select json_build_object('id', t.id, 'title', t.title, 'projectId', t.project_id)
    from task_templates t where t.id = tasks.template_id)`,
  blockers: sql<Blocker[]>`coalesce((
    select json_agg(json_build_object(
      'open', p.deleted_at is null and exists (
        select 1 from project_members m
        where m.project_id = p.id and m.user_id = ${currentUser}),
      'keyPrefix', b.key_prefix,
      'number', blocking.number,
      'title', blocking.title
    ) order by link.created_at)
    from task_links link
    join tasks blocking on blocking.id = link.blocking_task_id
    join boards b on b.id = blocking.board_id
    join projects p on p.id = b.project_id
    where link.blocked_task_id = tasks.id
      and blocking.completed_at is null and blocking.canceled_at is null
      and blocking.archived_at is null and blocking.deleted_at is null), '[]')`
}

export const describedColumns = {
  id: tasks.id,
  sectionId: tasks.sectionId,
  parentId: tasks.parentId,
  number: tasks.number,
  title: tasks.title,
  priority: tasks.priority,
  dueDate: tasks.dueDate,
  dueTime: tasks.dueTime,
  dueZone: tasks.dueZone,
  deadline: tasks.deadline,
  duration: tasks.duration,
  durationUnit: tasks.durationUnit,
  recurEvery: tasks.recurEvery,
  recurUnit: tasks.recurUnit,
  recurFromCompletion: tasks.recurFromCompletion,
  templateId: tasks.templateId,
  completedAt: tasks.completedAt,
  canceledAt: tasks.canceledAt
}

type DescribedTask = Pick<
  typeof tasks.$inferSelect,
  keyof typeof describedColumns
>

interface Extras {
  assigneeIds: string[]
  labelIds: string[]
  commentCount: number
  template: { id: string; title: string; projectId: string } | null
  blockers: Blocker[]
}

interface TaskOnBoard {
  task: DescribedTask
  board: typeof boards.$inferSelect
  members: Member[]
  labels: { id: string; name: string; color: string | null }[]
}

export function describeTasks(
  tx: Tx,
  board: typeof boards.$inferSelect,
  rows: DescribedTask[],
  members: Member[],
  boardLabels: TaskOnBoard['labels']
) {
  return describeTasksOf(
    tx,
    rows.map(task => ({ task, board, members, labels: boardLabels }))
  )
}

// Tasks of many boards in as many statements as the tasks of one.
export async function describeTasksOf(tx: Tx, rows: TaskOnBoard[]) {
  const ids = rows.map(({ task }) => task.id)
  if (ids.length === 0) return []
  const extras = await tx
    .select({ id: tasks.id, ...describedExtras })
    .from(tasks)
    .where(anyOf(tasks.id, ids))
  const byId = new Map(extras.map(row => [row.id, row]))
  const pick = picker()
  // A task deleted since its row was read shows nothing more.
  return rows.map(row =>
    described(row, byId.get(row.task.id) ?? NO_EXTRAS, pick)
  )
}

type Picker = ReturnType<typeof picker>

// Rows of a board, or of a project, share one members and one labels array,
// so each is indexed once instead of scanned for every task.
function picker() {
  const positions = new WeakMap<object[], Map<string, number>>()
  return <T extends object>(
    list: T[],
    key: (item: T) => string,
    wanted: string[]
  ): T[] => {
    let index = positions.get(list)
    if (!index) {
      index = new Map(list.map((item, i) => [key(item), i]))
      positions.set(list, index)
    }
    const found = index
    return wanted
      .flatMap(id => found.get(id) ?? [])
      .sort((a, b) => a - b)
      .map(i => list[i] as T)
  }
}

const NO_EXTRAS: Extras = {
  assigneeIds: [],
  labelIds: [],
  commentCount: 0,
  template: null,
  blockers: []
}

/** Tasks read with `describedExtras`, which need no further statement. */
export function describeRead(
  board: typeof boards.$inferSelect,
  rows: (DescribedTask & Extras)[],
  members: Member[],
  boardLabels: TaskOnBoard['labels']
) {
  const pick = picker()
  return rows.map(task =>
    described({ task, board, members, labels: boardLabels }, task, pick)
  )
}

function described(
  { task, board, members, labels }: TaskOnBoard,
  extra: Extras,
  pick: Picker
) {
  const template = extra.template
  return {
    id: task.id,
    key: `${board.keyPrefix}-${String(task.number)}`,
    sectionId: task.sectionId,
    parentId: task.parentId,
    title: task.title,
    priority: task.priority,
    dueDate: task.dueDate,
    dueTime: task.dueTime?.slice(0, 5) ?? null,
    dueZone: task.dueZone,
    deadline: task.deadline,
    duration:
      task.duration && task.durationUnit
        ? { amount: task.duration, unit: task.durationUnit }
        : null,
    recurrence: recurrenceOf(task),
    template:
      template?.projectId === board.projectId
        ? { id: template.id, title: template.title }
        : null,
    completedAt: task.completedAt,
    canceledAt: task.canceledAt,
    // Someone who left the board stays assigned, but is not shown.
    assignees: pick(members, member => member.userId, extra.assigneeIds),
    labels: pick(labels, label => label.id, extra.labelIds),
    commentCount: extra.commentCount,
    blockers: extra.blockers.map(blocker =>
      blocker.open
        ? {
            key: `${blocker.keyPrefix}-${String(blocker.number)}`,
            title: blocker.title
          }
        : null
    )
  }
}
