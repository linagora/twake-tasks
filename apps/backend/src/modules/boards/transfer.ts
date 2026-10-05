import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { generateKeyBetween } from 'fractional-indexing'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { membersOf } from './access.ts'
import { labelsOn } from './labels.ts'
import { boards, taskAssignees, taskLabels, tasks } from './schema.ts'
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

export function createTransferStore(db: Db) {
  return {
    // The task and its sub-tasks take new numbers on the target board, in
    // depth order, and keep their old keys. Labels and assignees the target
    // board does not have are dropped.
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
        const tree = await tx.execute<{ id: string; rank: number }>(sql`
          with recursive tree as (
            select id, number, 0 as depth from tasks where id = ${taskId}
            union all
            select child.id, child.number, tree.depth + 1
            from tasks child join tree on child.parent_id = tree.id
          )
          select id, (row_number() over (order by depth, number))::int as rank
          from tree`)
        const ids = tree.map(row => row.id)
        const target = await bumpBoard(tx, to.boardId, {
          taskCounter: sql`${boards.taskCounter} + ${ids.length}`
        })
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
        const labels = await labelsOn(tx, target)
        await tx.delete(taskLabels).where(
          and(
            inArray(taskLabels.taskId, ids),
            notInArray(
              taskLabels.labelId,
              labels.map(label => label.id)
            )
          )
        )
        const members = await membersOf(tx, {
          id: to.boardId,
          spaceId: target.spaceId
        })
        await tx.delete(taskAssignees).where(
          and(
            inArray(taskAssignees.taskId, ids),
            notInArray(
              taskAssignees.userId,
              members.map(member => member.userId)
            )
          )
        )
        return { key: `${target.keyPrefix}-${String(first)}` }
      })
    }
  }
}
