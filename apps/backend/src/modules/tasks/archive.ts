import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { asTenant, inTenant, type Db, type Tx } from '../../infra/db.ts'
import {
  schedule,
  unschedule,
  type Handler
} from '../../scheduler/scheduler.ts'
import type { Identity } from '../auth/index.ts'
import { checkRole, membersOf, roleOn } from '../boards/access.ts'
import { describeTasks } from '../boards/describe.ts'
import { labelsOn } from '../boards/labels.ts'
import { boards, projects, tasks } from '../boards/schema.ts'
import { taskOf } from '../boards/taskRows.ts'
import { bumpBoard } from '../boards/versions.ts'
import { Refused, writeOrRefuse } from '../kernel/index.ts'

export const PURGE_JOB = 'purge-task'

const RETENTION_MS = 30 * 24 * 3600 * 1000

const keyOf = (taskId: string) => `${PURGE_JOB}:${taskId}`

const payload = z.object({
  taskId: z.uuid(),
  organizationId: z.string().nullable(),
  userId: z.uuid(),
  email: z.string()
})

type Stamp = 'archivedAt' | 'deletedAt'

const columnOf = { archivedAt: 'archived_at', deletedAt: 'deleted_at' }

// The task and its shown sub-tasks get the same stamp; restoring clears it from
// the task and from the sub-tasks that carry that exact stamp.
// Only the task acted on is logged in its history: its sub-tasks follow it
// silently, or their followers would be notified once each.
async function hide(tx: Tx, taskId: string, stamp: Stamp) {
  const column = sql.raw(columnOf[stamp])
  await tx.execute(sql`update tasks set ${column} = now() where id = ${taskId}`)
  await tx.execute(sql`select set_config('app.cascading', 'on', true)`)
  await tx.execute(sql`
    with recursive tree as (
      select id from tasks where id = ${taskId}
      union all
      select child.id from tasks child join tree on child.parent_id = tree.id
      where child.archived_at is null and child.deleted_at is null
    )
    update tasks set ${column} = now()
    where id in (select id from tree) and id <> ${taskId}`)
  await tx.execute(sql`select set_config('app.cascading', '', true)`)
}

async function reveal(tx: Tx, task: typeof tasks.$inferSelect) {
  const stamp: Stamp = task.deletedAt ? 'deletedAt' : 'archivedAt'
  const column = sql.raw(columnOf[stamp])
  await tx.execute(sql`select set_config('app.cascading', 'on', true)`)
  await tx.execute(sql`
    with recursive tree as (
      select id from tasks where id = ${task.id}
      union all
      select child.id from tasks child join tree on child.parent_id = tree.id
      where child.${column} = (select ${column} from tasks where id = ${task.id})
    )
    update tasks set ${column} = null
    where id in (select id from tree) and id <> ${task.id}`)
  await tx.execute(sql`select set_config('app.cascading', '', true)`)
  await tx.execute(sql`update tasks set ${column} = null where id = ${task.id}`)
}

// Runs as the creator of the board's project, whom the projects policy always
// lets see it.
export const purgeTask: Handler = async (raw, tx) => {
  const job = payload.parse(raw)
  await asTenant(tx, job)
  await tx
    .delete(tasks)
    .where(and(eq(tasks.id, job.taskId), isNotNull(tasks.deletedAt)))
  return undefined
}

export function createArchiveStore(db: Db) {
  const visibleTask = async (
    tx: Tx,
    identity: Identity,
    boardId: string,
    taskId: string
  ) => {
    await checkRole(tx, identity, boardId, 'editor')
    const board = await bumpBoard(tx, boardId)
    const task = await taskOf(tx, boardId, taskId)
    if (task.archivedAt || task.deletedAt) throw new Refused('not_found')
    return { board, task }
  }

  return {
    archiveTask(identity: Identity, boardId: string, taskId: string) {
      return writeOrRefuse(db, identity, async tx => {
        await visibleTask(tx, identity, boardId, taskId)
        await hide(tx, taskId, 'archivedAt')
        return null
      })
    },

    trashTask(identity: Identity, boardId: string, taskId: string) {
      return writeOrRefuse(db, identity, async tx => {
        const { board, task } = await visibleTask(tx, identity, boardId, taskId)
        await hide(tx, taskId, 'deletedAt')
        const [project] = await tx
          .select({ createdBy: projects.createdBy })
          .from(projects)
          .where(eq(projects.id, board.projectId))
        await schedule(tx, {
          kind: PURGE_JOB,
          key: keyOf(taskId),
          taskId,
          payload: {
            taskId,
            organizationId: task.organizationId,
            userId: project?.createdBy ?? identity.userId,
            email: identity.email
          },
          runAt: new Date(Date.now() + RETENTION_MS)
        })
        return null
      })
    },

    restoreTask(identity: Identity, boardId: string, taskId: string) {
      return writeOrRefuse(db, identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        await bumpBoard(tx, boardId)
        const task = await taskOf(tx, boardId, taskId)
        if (!task.archivedAt && !task.deletedAt) return null
        if (task.parentId !== null) {
          const parent = await taskOf(tx, boardId, task.parentId)
          if (parent.archivedAt || parent.deletedAt) {
            throw new Refused('invalid_parent')
          }
        }
        await reveal(tx, task)
        await unschedule(tx, keyOf(taskId))
        return null
      })
    },

    /** The tasks archived or trashed on their own, latest first. */
    hiddenTasks(identity: Identity, boardId: string, stamp: Stamp) {
      return inTenant(db, identity, async tx => {
        if (!(await roleOn(tx, identity.userId, boardId))) return null
        const column = sql.raw(columnOf[stamp])
        const [board] = await tx
          .select()
          .from(boards)
          .where(eq(boards.id, boardId))
        if (!board) return null
        const rows = await tx
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.boardId, boardId),
              isNotNull(tasks[stamp]),
              sql`not exists (select 1 from tasks parent where parent.id = ${tasks.parentId} and parent.${column} = ${tasks[stamp]})`
            )
          )
          .orderBy(desc(tasks[stamp]))
        if (rows.length === 0) return []
        const described = await describeTasks(
          tx,
          board,
          rows,
          await membersOf(tx, board),
          await labelsOn(tx, board)
        )
        return described.map((task, index) => ({
          ...task,
          at: rows[index]?.[stamp] ?? null
        }))
      })
    }
  }
}
