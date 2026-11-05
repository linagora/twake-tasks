import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import {
  boards,
  bumpBoard,
  checkRole,
  completionFor,
  inSection,
  membersOf,
  positionBetween,
  sectionOf,
  shown,
  shownTaskOf,
  taskAssignees,
  taskHistory,
  taskLabels,
  tasks
} from '../boards/index.ts'
import { writeOrRefuse } from '../kernel/index.ts'

type TaskRow = typeof tasks.$inferSelect

// The copy sits right after the original, under a new number, with its open
// and done sub-tasks open again, unless the copy lands done. Comments,
// history, reminders, followers and links stay behind, and so do canceled
// sub-tasks.
export function createDuplicateStore(db: Db) {
  return {
    duplicateTask(
      identity: Identity,
      boardId: string,
      taskId: string,
      input: { title: string }
    ) {
      return writeOrRefuse(db, identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        const board = await bumpBoard(tx, boardId)
        const original = await shownTaskOf(tx, boardId, taskId)
        const levels = await subtreeOf(tx, original)
        const copied = levels.flat()
        const [counted] = await tx
          .update(boards)
          .set({ taskCounter: sql`${boards.taskCounter} + ${copied.length}` })
          .where(eq(boards.id, boardId))
          .returning({ last: boards.taskCounter })
        if (!counted) throw new Error('board update returned nothing')
        const first = counted.last - copied.length + 1
        const numbers = new Map(copied.map((row, at) => [row.id, first + at]))
        const section = await sectionOf(tx, boardId, original.sectionId)
        const siblings = await tx
          .select({ id: tasks.id, position: tasks.position })
          .from(tasks)
          .where(
            original.parentId === null
              ? inSection(boardId, original.sectionId)
              : and(
                  eq(tasks.boardId, boardId),
                  eq(tasks.parentId, original.parentId)
                )
          )
          .orderBy(asc(tasks.position))
        const position = positionBetween(siblings, original.id, undefined)
        // Sub-tasks complete with their parent, as moving it to such a section
        // would do.
        const completion = completionFor(section?.category ?? null)

        // A copy notifies no one, as a copied board does not.
        await tx.execute(sql`select set_config('app.importing', 'on', true)`)
        const newIds = new Map<string, string>()
        for (const level of levels) {
          const inserted = await tx
            .insert(tasks)
            .values(
              level.map(row => {
                const root = row.id === original.id
                return {
                  boardId,
                  sectionId: row.sectionId,
                  parentId: root
                    ? row.parentId
                    : (newIds.get(row.parentId ?? '') ?? null),
                  organizationId: board.organizationId,
                  number: numbers.get(row.id) ?? 0,
                  title: root ? input.title : row.title,
                  description: row.description,
                  descriptionText: row.descriptionText,
                  priority: row.priority,
                  dueDate: row.dueDate,
                  dueTime: row.dueTime,
                  dueZone: row.dueZone,
                  deadline: row.deadline,
                  duration: row.duration,
                  durationUnit: row.durationUnit,
                  recurEvery: row.recurEvery,
                  recurUnit: row.recurUnit,
                  recurFromCompletion: row.recurFromCompletion,
                  position: root ? position : row.position,
                  createdBy: identity.userId,
                  ...(root
                    ? completion
                    : { completedAt: completion.completedAt, canceledAt: null })
                }
              })
            )
            .returning({ id: tasks.id, number: tasks.number })
          const byNumber = new Map(inserted.map(task => [task.number, task.id]))
          for (const row of level) {
            const id = byNumber.get(numbers.get(row.id) ?? 0)
            if (id) newIds.set(row.id, id)
          }
        }

        const origins = copied.flatMap(row => {
          const id = newIds.get(row.id)
          return id
            ? [
                sql`(${id}::uuid, ${`${board.keyPrefix}-${String(row.number)}`})`
              ]
            : []
        })
        await tx.execute(sql`
          update ${taskHistory} set "from" = to_jsonb(origin.key)
          from (values ${sql.join(origins, sql`, `)}) as origin(id, key)
          where ${taskHistory.taskId} = origin.id and ${taskHistory.field} = 'created'`)

        const sources = copied.map(row => row.id)
        const labelings = (
          await tx
            .select({ taskId: taskLabels.taskId, labelId: taskLabels.labelId })
            .from(taskLabels)
            .where(inArray(taskLabels.taskId, sources))
        ).flatMap(row => {
          const id = newIds.get(row.taskId)
          return id
            ? [
                {
                  taskId: id,
                  labelId: row.labelId,
                  organizationId: board.organizationId
                }
              ]
            : []
        })
        if (labelings.length > 0) await tx.insert(taskLabels).values(labelings)

        const members = new Set(
          (await membersOf(tx, board)).map(member => member.userId)
        )
        const assignments = (
          await tx
            .select({
              taskId: taskAssignees.taskId,
              userId: taskAssignees.userId
            })
            .from(taskAssignees)
            .where(inArray(taskAssignees.taskId, sources))
        ).flatMap(row => {
          const id = newIds.get(row.taskId)
          return id && members.has(row.userId)
            ? [
                {
                  taskId: id,
                  userId: row.userId,
                  organizationId: board.organizationId
                }
              ]
            : []
        })
        if (assignments.length > 0) {
          await tx.insert(taskAssignees).values(assignments)
        }

        const id = newIds.get(original.id)
        if (!id) throw new Error('task insert returned nothing')
        return {
          id,
          key: `${board.keyPrefix}-${String(first)}`,
          title: input.title,
          sectionId: original.sectionId
        }
      })
    }
  }
}

async function subtreeOf(tx: Tx, task: TaskRow) {
  const levels: TaskRow[][] = []
  let level = [task]
  while (level.length > 0) {
    levels.push(level)
    level = await tx
      .select()
      .from(tasks)
      .where(
        and(
          inArray(
            tasks.parentId,
            level.map(row => row.id)
          ),
          shown,
          isNull(tasks.canceledAt)
        )
      )
      .orderBy(asc(tasks.number))
  }
  return levels
}
