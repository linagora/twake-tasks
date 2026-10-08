import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { generateKeyBetween } from 'fractional-indexing'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { membersOf } from './access.ts'
import { labelsOn } from './labels.ts'
import { boards, labels, taskAssignees, taskLabels, tasks } from './schema.ts'
import {
  bumpBoard,
  checkRole,
  completionFor,
  inSection,
  Refused,
  sectionOf,
  taskOf,
  writeOrRefuse
} from './tasks.ts'

export interface TransferPreview {
  /** People assigned to the task or a sub-task who are not on the target board. */
  droppedAssignees: {
    userId: string
    name: string | null
    email: string | null
  }[]
  /** Labels the target project lacks and the move creates there. */
  createdLabels: string[]
}

interface Placed {
  projectId: string
}

// The task and its sub-tasks, in depth order.
async function treeOf(tx: Tx, taskId: string) {
  return tx.execute<{ id: string; rank: number }>(sql`
    with recursive tree as (
      select id, number, 0 as depth from tasks where id = ${taskId}
      union all
      select child.id, child.number, tree.depth + 1
      from tasks child join tree on child.parent_id = tree.id
    )
    select id, (row_number() over (order by depth, number))::int as rank
    from tree`)
}

// What a move changes for the task and its sub-tasks. The preview and the
// move both read it, so the preview is exactly what the move does. Labels
// follow by name into another project, which creates the ones it lacks: moving
// needs the editor role on the target, as creating a label does.
async function carryOver(tx: Tx, ids: string[], from: Placed, to: Placed) {
  const members = await membersOf(tx, to)
  const assigned = await tx
    .selectDistinct({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(inArray(taskAssignees.taskId, ids))
  const staying = new Set(members.map(member => member.userId))
  const leaving = assigned.filter(row => !staying.has(row.userId))
  const known = new Map(
    (await membersOf(tx, from)).map(member => [member.userId, member])
  )
  const droppedAssignees = leaving
    .map(({ userId }) => ({
      userId,
      name: known.get(userId)?.name ?? null,
      email: known.get(userId)?.email ?? null
    }))
    .sort((a, b) =>
      (a.name ?? a.email ?? a.userId).localeCompare(
        b.name ?? b.email ?? b.userId
      )
    )

  const carried =
    from.projectId === to.projectId
      ? []
      : await tx
          .selectDistinct({ id: labels.id, name: labels.name })
          .from(taskLabels)
          .innerJoin(labels, eq(labels.id, taskLabels.labelId))
          .where(inArray(taskLabels.taskId, ids))
          .orderBy(labels.name)
  const existing = new Set((await labelsOn(tx, to)).map(label => label.name))
  const createdLabels = carried
    .map(label => label.name)
    .filter(name => !existing.has(name))
  return { droppedAssignees, createdLabels }
}

// Re-attaches each label to the label of the same name in the target project,
// creating it there when it is missing. Concurrent moves of the same name
// share the one label that wins the unique(project, name) conflict.
async function followLabels(
  tx: Tx,
  ids: string[],
  target: { projectId: string; organizationId: string | null }
) {
  const carried = await tx
    .select({ taskId: taskLabels.taskId, name: labels.name })
    .from(taskLabels)
    .innerJoin(labels, eq(labels.id, taskLabels.labelId))
    .where(inArray(taskLabels.taskId, ids))
  if (carried.length > 0) {
    await tx
      .insert(labels)
      .values(
        [...new Set(carried.map(row => row.name))].map(name => ({
          organizationId: target.organizationId,
          projectId: target.projectId,
          name
        }))
      )
      .onConflictDoNothing()
    const there = new Map(
      (await labelsOn(tx, target)).map(label => [label.name, label.id])
    )
    await tx
      .insert(taskLabels)
      .values(
        carried.flatMap(row => {
          const labelId = there.get(row.name)
          return labelId === undefined
            ? []
            : [
                {
                  taskId: row.taskId,
                  labelId,
                  organizationId: target.organizationId
                }
              ]
        })
      )
      .onConflictDoNothing()
  }
  const keep = (await labelsOn(tx, target)).map(label => label.id)
  await tx
    .delete(taskLabels)
    .where(
      and(inArray(taskLabels.taskId, ids), notInArray(taskLabels.labelId, keep))
    )
}

export function createTransferStore(db: Db) {
  return {
    // The task and its sub-tasks take new numbers on the target board, in
    // depth order, and keep their old keys. Assignees who are not on the
    // target board are dropped, and labels follow by name.
    transferTask(
      identity: Identity,
      boardId: string,
      taskId: string,
      to: { boardId: string; sectionId: string | null }
    ) {
      return writeOrRefuse(db, identity, async (tx: Tx) => {
        if (to.boardId === boardId) throw new Refused('same_board')
        await checkRole(tx, identity, boardId, 'editor')
        await checkRole(tx, identity, to.boardId, 'editor')
        const from = await bumpBoard(tx, boardId)
        const task = await taskOf(tx, boardId, taskId)
        if (task.parentId !== null) throw new Refused('invalid_parent')
        const section = await sectionOf(tx, to.boardId, to.sectionId)
        const tree = await treeOf(tx, taskId)
        const ids = tree.map(row => row.id)
        const target = await bumpBoard(tx, to.boardId, {
          taskCounter: sql`${boards.taskCounter} + ${ids.length}`
        })
        const { droppedAssignees, createdLabels } = await carryOver(
          tx,
          ids,
          from,
          target
        )
        const first = target.number - ids.length + 1
        const [last] = await tx
          .select({ position: tasks.position })
          .from(tasks)
          .where(inSection(to.boardId, to.sectionId))
          .orderBy(desc(tasks.position))
          .limit(1)
        const ranks = sql.join(
          tree.map(row => sql`(${row.id}::uuid, ${row.rank}::int)`),
          sql`, `
        )
        await tx.execute(sql`
          update tasks set
            board_id = ${to.boardId},
            number = ${first - 1} + ranked.rank,
            previous_keys = tasks.previous_keys || (${from.keyPrefix}::text || '-' || tasks.number),
            section_id = case when tasks.id = ${taskId} then ${to.sectionId}::uuid end,
            position = case when tasks.id = ${taskId}
              then ${generateKeyBetween(last?.position ?? null, null)}
              else tasks.position end
          from (values ${ranks}) as ranked(id, rank)
          where tasks.id = ranked.id`)
        await tx
          .update(tasks)
          .set(completionFor(section?.category ?? null, task))
          .where(eq(tasks.id, taskId))
        if (from.projectId !== target.projectId) {
          await followLabels(tx, ids, target)
        }
        if (droppedAssignees.length > 0) {
          await tx.delete(taskAssignees).where(
            and(
              inArray(taskAssignees.taskId, ids),
              inArray(
                taskAssignees.userId,
                droppedAssignees.map(person => person.userId)
              )
            )
          )
        }
        return {
          key: `${target.keyPrefix}-${String(first)}`,
          droppedAssignees,
          createdLabels
        }
      })
    }
  }
}
