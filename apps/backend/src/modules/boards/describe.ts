import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { currentUser, type Tx } from '../../infra/db.ts'
import type { Member } from './access.ts'
import { recurrenceOf } from './recurrence.ts'
import {
  boards,
  comments,
  projectMembers,
  projects,
  taskAssignees,
  taskLabels,
  taskLinks,
  tasks,
  taskTemplates
} from './schema.ts'

export const shown = and(isNull(tasks.archivedAt), isNull(tasks.deletedAt))

// The open blockers of each task, null for one on a board the person cannot
// open, which row level security alone does not hide in an organization.
async function openBlockers(tx: Tx, ids: string[]) {
  const rows = await tx
    .select({
      taskId: taskLinks.blockedTaskId,
      open: sql<boolean>`${projects.deletedAt} is null and exists (
        select 1 from ${projectMembers}
        where ${projectMembers.projectId} = ${projects.id}
          and ${projectMembers.userId} = ${currentUser}
      )`,
      keyPrefix: boards.keyPrefix,
      number: tasks.number,
      title: tasks.title
    })
    .from(taskLinks)
    .innerJoin(tasks, eq(tasks.id, taskLinks.blockingTaskId))
    .innerJoin(boards, eq(boards.id, tasks.boardId))
    .innerJoin(projects, eq(projects.id, boards.projectId))
    .where(
      and(
        inArray(taskLinks.blockedTaskId, ids),
        isNull(tasks.completedAt),
        isNull(tasks.canceledAt),
        shown
      )
    )
    .orderBy(asc(taskLinks.createdAt))
  const byTask = new Map<string, ({ key: string; title: string } | null)[]>()
  for (const row of rows) {
    const blocker = row.open
      ? { key: `${row.keyPrefix}-${String(row.number)}`, title: row.title }
      : null
    byTask.set(row.taskId, [...(byTask.get(row.taskId) ?? []), blocker])
  }
  return byTask
}

export async function describeTasks(
  tx: Tx,
  board: typeof boards.$inferSelect,
  rows: (typeof tasks.$inferSelect)[],
  members: Member[],
  boardLabels: { id: string; name: string; color: string | null }[]
) {
  const ids = rows.map(task => task.id)
  if (ids.length === 0) return []
  const assignments = await tx
    .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(inArray(taskAssignees.taskId, ids))
  const labeled = await tx
    .select({ taskId: taskLabels.taskId, labelId: taskLabels.labelId })
    .from(taskLabels)
    .where(inArray(taskLabels.taskId, ids))
  const commented = await tx
    .select({ taskId: comments.taskId, count: sql<number>`count(*)::int` })
    .from(comments)
    .where(inArray(comments.taskId, ids))
    .groupBy(comments.taskId)
  const templateIds = rows.flatMap(task => task.templateId ?? [])
  const templates =
    templateIds.length === 0
      ? []
      : await tx
          .select({ id: taskTemplates.id, title: taskTemplates.title })
          .from(taskTemplates)
          .where(
            and(
              inArray(taskTemplates.id, templateIds),
              eq(taskTemplates.projectId, board.projectId)
            )
          )
  const templatesById = new Map(templates.map(t => [t.id, t]))
  const assigned = new Set(assignments.map(a => `${a.taskId}:${a.userId}`))
  const labeledWith = new Set(labeled.map(l => `${l.taskId}:${l.labelId}`))
  const commentCounts = new Map(commented.map(c => [c.taskId, c.count]))
  const blockers = await openBlockers(tx, ids)
  return rows.map(task => ({
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
      task.templateId === null
        ? null
        : (templatesById.get(task.templateId) ?? null),
    completedAt: task.completedAt,
    canceledAt: task.canceledAt,
    // Someone who left the board stays assigned, but is not shown.
    assignees: members.filter(member =>
      assigned.has(`${task.id}:${member.userId}`)
    ),
    labels: boardLabels.filter(label =>
      labeledWith.has(`${task.id}:${label.id}`)
    ),
    commentCount: commentCounts.get(task.id) ?? 0,
    blockers: blockers.get(task.id) ?? []
  }))
}
