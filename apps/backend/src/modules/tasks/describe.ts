import { and, inArray, isNull, sql } from 'drizzle-orm'
import type { Tx } from '../../infra/db.ts'
import type { Member } from '../boards/access.ts'
import { recurrenceOf } from '../boards/recurrence.ts'
import {
  boards,
  comments,
  taskAssignees,
  taskLabels,
  tasks
} from '../boards/schema.ts'

export const shown = and(isNull(tasks.archivedAt), isNull(tasks.deletedAt))

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
  const assigned = new Set(assignments.map(a => `${a.taskId}:${a.userId}`))
  const labeledWith = new Set(labeled.map(l => `${l.taskId}:${l.labelId}`))
  const commentCounts = new Map(commented.map(c => [c.taskId, c.count]))
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
    completedAt: task.completedAt,
    canceledAt: task.canceledAt,
    // Someone who left the board stays assigned, but is not shown.
    assignees: members.filter(member =>
      assigned.has(`${task.id}:${member.userId}`)
    ),
    labels: boardLabels.filter(label =>
      labeledWith.has(`${task.id}:${label.id}`)
    ),
    commentCount: commentCounts.get(task.id) ?? 0
  }))
}
