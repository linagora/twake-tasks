import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { membersOf } from './access.ts'
import { shown } from './describe.ts'
import {
  boards,
  labels,
  sections,
  taskAssignees,
  taskHistory,
  taskLabels,
  tasks
} from './schema.ts'
import { completionFor } from './taskRows.ts'

export interface CopyOptions {
  boardId: string
  tasks: boolean
  assignees: boolean
  dueDates: boolean
}

type Board = typeof boards.$inferSelect
type TaskRow = typeof tasks.$inferSelect

const folded = sql<string>`lower(${labels.name})`

// Into a new board: the sections, the labels of the source project, and the
// open tasks with their sub-tasks, all open again under new numbers. Done and
// canceled tasks stay behind, and so do comments, reminders and followers.
export async function copyBoard(
  tx: Tx,
  identity: Identity,
  source: Board,
  target: Board,
  options: CopyOptions
) {
  const sectionRows = await tx
    .select()
    .from(sections)
    .where(eq(sections.boardId, source.id))
    .orderBy(asc(sections.position))
  const copiedSections =
    sectionRows.length === 0
      ? []
      : await tx
          .insert(sections)
          .values(
            sectionRows.map(({ name, category, position }) => ({
              boardId: target.id,
              organizationId: target.organizationId,
              name,
              category,
              position
            }))
          )
          .returning({ id: sections.id, position: sections.position })
  const byPosition = new Map(copiedSections.map(row => [row.position, row.id]))
  const sectionFor = new Map(
    sectionRows.map(row => [
      row.id,
      { id: byPosition.get(row.position) ?? null, category: row.category }
    ])
  )

  const sameProject = source.projectId === target.projectId
  if (!sameProject) {
    const sourceLabels = await tx
      .select({ name: labels.name, color: labels.color })
      .from(labels)
      .where(eq(labels.projectId, source.projectId))
      .orderBy(labels.name)
    if (sourceLabels.length > 0) {
      await tx
        .insert(labels)
        .values(
          sourceLabels.map(label => ({
            ...label,
            projectId: target.projectId,
            organizationId: target.organizationId
          }))
        )
        .onConflictDoNothing()
    }
  }
  if (!options.tasks) return

  const rows = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.boardId, source.id), shown, isNull(tasks.canceledAt)))
    .orderBy(asc(tasks.number))
  const children = Map.groupBy(rows, row => row.parentId)
  const levels: TaskRow[][] = []
  let level = (children.get(null) ?? []).filter(row => row.completedAt === null)
  while (level.length > 0) {
    levels.push(level)
    level = level.flatMap(row => children.get(row.id) ?? [])
  }
  const copied = levels.flat()
  if (copied.length === 0) return

  await tx.execute(sql`select set_config('app.importing', 'on', true)`)
  await tx
    .update(boards)
    .set({ taskCounter: copied.length })
    .where(eq(boards.id, target.id))
  const numbers = new Map(
    copied
      .sort((a, b) => a.number - b.number)
      .map((row, at) => [row.id, at + 1])
  )
  const newIds = new Map<string, string>()
  for (const depth of levels.flatMap(inChunks)) {
    const inserted = await tx
      .insert(tasks)
      .values(
        depth.map(row => {
          const section = row.sectionId ? sectionFor.get(row.sectionId) : null
          const dates = options.dueDates
            ? {
                dueDate: row.dueDate,
                dueTime: row.dueTime,
                dueZone: row.dueZone,
                deadline: row.deadline,
                recurEvery: row.recurEvery,
                recurUnit: row.recurUnit,
                recurFromCompletion: row.recurFromCompletion
              }
            : {}
          return {
            boardId: target.id,
            sectionId: section?.id ?? null,
            parentId: row.parentId ? (newIds.get(row.parentId) ?? null) : null,
            organizationId: target.organizationId,
            number: numbers.get(row.id) ?? 0,
            title: row.title,
            description: row.description,
            descriptionText: row.descriptionText,
            priority: row.priority,
            duration: row.duration,
            durationUnit: row.durationUnit,
            ...dates,
            position: row.position,
            createdBy: identity.userId,
            ...completionFor(section?.category ?? null)
          }
        })
      )
      .returning({ id: tasks.id, number: tasks.number })
    const byNumber = new Map(inserted.map(task => [task.number, task.id]))
    const origins = depth.flatMap(row => {
      const id = byNumber.get(numbers.get(row.id) ?? 0)
      if (!id) return []
      newIds.set(row.id, id)
      return [
        sql`(${id}::uuid, ${`${source.keyPrefix}-${String(row.number)}`})`
      ]
    })
    // The created entry names the task it was copied from, where an import
    // says "import".
    await tx.execute(sql`
      update ${taskHistory} set "from" = to_jsonb(origin.key)
      from (values ${sql.join(origins, sql`, `)}) as origin(id, key)
      where ${taskHistory.taskId} = origin.id and ${taskHistory.field} = 'created'`)
  }
  const onSource = tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.boardId, source.id))

  const labeled = await tx
    .select({
      taskId: taskLabels.taskId,
      labelId: taskLabels.labelId,
      key: folded
    })
    .from(taskLabels)
    .innerJoin(labels, eq(labels.id, taskLabels.labelId))
    .where(inArray(taskLabels.taskId, onSource))
  const there = sameProject
    ? null
    : new Map(
        (
          await tx
            .select({ id: labels.id, key: folded })
            .from(labels)
            .where(eq(labels.projectId, target.projectId))
        ).map(label => [label.key, label.id])
      )
  const labelings = labeled.flatMap(row => {
    const taskId = newIds.get(row.taskId)
    const labelId = there ? there.get(row.key) : row.labelId
    return taskId && labelId
      ? [{ taskId, labelId, organizationId: target.organizationId }]
      : []
  })
  for (const chunk of inChunks(labelings)) {
    await tx.insert(taskLabels).values(chunk)
  }

  if (!options.assignees) return
  const staying = new Set(
    (await membersOf(tx, target)).map(member => member.userId)
  )
  const assigned = await tx
    .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(inArray(taskAssignees.taskId, onSource))
  const assignments = assigned.flatMap(row => {
    const taskId = newIds.get(row.taskId)
    return taskId && staying.has(row.userId)
      ? [{ taskId, userId: row.userId, organizationId: target.organizationId }]
      : []
  })
  for (const chunk of inChunks(assignments)) {
    await tx.insert(taskAssignees).values(chunk)
  }
}

// Below the 65 535 parameters of one statement, at some twenty per task.
const CHUNK = 1000

function inChunks<T>(rows: T[]): T[][] {
  const chunks: T[][] = []
  for (let at = 0; at < rows.length; at += CHUNK) {
    chunks.push(rows.slice(at, at + CHUNK))
  }
  return chunks
}
