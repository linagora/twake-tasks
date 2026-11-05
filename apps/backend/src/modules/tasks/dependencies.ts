import { and, asc, eq, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import {
  accessibleBoards,
  boards,
  bumpBoard,
  bumpBoards,
  checkRole,
  roleOn,
  sections,
  shownTaskOf,
  taskLinks,
  tasks
} from '../boards/index.ts'
import { Refused, writeOrRefuse } from '../kernel/index.ts'
import { visibleTask } from './tasks.ts'

export type LinkKind = 'blockedBy' | 'blocks'

// Whether `from` blocks `to`, directly or through other tasks.
const blocksInTurn = (from: string, to: string) =>
  sql`exists (
    with recursive downstream(id) as (
      select ${taskLinks.blockedTaskId} from ${taskLinks}
      where ${taskLinks.blockingTaskId} = ${from}
      union
      select ${taskLinks.blockedTaskId} from ${taskLinks}
      join downstream on ${taskLinks.blockingTaskId} = downstream.id
    )
    select 1 from downstream where id = ${to}
  )`

const below = (parentId: string, taskId: string) =>
  sql`exists (
    with recursive below(id) as (
      select ${tasks.id} from ${tasks} where ${tasks.parentId} = ${parentId}
      union
      select ${tasks.id} from ${tasks} join below on ${tasks.parentId} = below.id
    )
    select 1 from below where id = ${taskId}
  )`

async function check(tx: Tx, condition: SQL) {
  const [row] = await tx.execute<{ yes: boolean }>(
    sql`select ${condition} as yes`
  )
  return row?.yes === true
}

// A linked task on a board the person cannot open shows as such, without its
// key or title. An archived or trashed one is left out until it is restored.
async function linksOf(tx: Tx, userId: string, taskId: string) {
  const accessible = accessibleBoards(tx, userId)
  const otherId = sql<string>`case when ${taskLinks.blockedTaskId} = ${taskId}
    then ${taskLinks.blockingTaskId} else ${taskLinks.blockedTaskId} end`
  const rows = await tx
    .select({
      blocked: sql<boolean>`${taskLinks.blockedTaskId} = ${taskId}`,
      taskId: otherId,
      open: sql<boolean>`${accessible.boardId} is not null`,
      boardId: tasks.boardId,
      boardName: boards.name,
      keyPrefix: boards.keyPrefix,
      number: tasks.number,
      title: tasks.title,
      section: sections.name,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      canceledAt: tasks.canceledAt
    })
    .from(taskLinks)
    .leftJoin(tasks, eq(tasks.id, otherId))
    .leftJoin(boards, eq(boards.id, tasks.boardId))
    .leftJoin(sections, eq(sections.id, tasks.sectionId))
    .leftJoin(accessible, eq(accessible.boardId, tasks.boardId))
    .where(
      and(
        or(
          eq(taskLinks.blockedTaskId, taskId),
          eq(taskLinks.blockingTaskId, taskId)
        ),
        isNull(tasks.archivedAt),
        isNull(tasks.deletedAt)
      )
    )
    .orderBy(asc(taskLinks.createdAt))
  const linked = rows.map(row => ({
    blocked: row.blocked,
    taskId: row.taskId,
    task:
      row.open && row.boardId !== null && row.number !== null
        ? {
            key: `${row.keyPrefix ?? ''}-${String(row.number)}`,
            title: row.title ?? '',
            boardId: row.boardId,
            boardName: row.boardName ?? '',
            section: row.section,
            dueDate: row.dueDate,
            done: row.completedAt !== null || row.canceledAt !== null
          }
        : null
  }))
  return {
    blockedBy: linked
      .filter(link => link.blocked)
      .map(({ taskId: id, task }) => ({ taskId: id, task })),
    blocks: linked
      .filter(link => !link.blocked)
      .map(({ taskId: id, task }) => ({ taskId: id, task }))
  }
}

export function createDependencyStore(db: Db) {
  return {
    listLinks(identity: Identity, boardId: string, taskId: string) {
      return writeOrRefuse(db, identity, async tx => {
        await visibleTask(tx, identity, boardId, taskId)
        return linksOf(tx, identity.userId, taskId)
      })
    },

    // Another organization's tasks are out of reach through row level
    // security. Without an organization, both tasks share a project, so that
    // everyone who sees one sees the other.
    addLink(
      identity: Identity,
      boardId: string,
      taskId: string,
      link: { kind: LinkKind; taskId: string }
    ) {
      return writeOrRefuse(db, identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        const board = await bumpBoard(tx, boardId)
        const task = await shownTaskOf(tx, boardId, taskId)
        if (link.taskId === taskId) throw new Refused('invalid_link')
        const [other] = await tx
          .select({
            id: tasks.id,
            boardId: tasks.boardId,
            projectId: boards.projectId,
            archivedAt: tasks.archivedAt,
            deletedAt: tasks.deletedAt
          })
          .from(tasks)
          .innerJoin(boards, eq(boards.id, tasks.boardId))
          .where(eq(tasks.id, link.taskId))
        if (!other || !(await roleOn(tx, identity.userId, other.boardId))) {
          throw new Refused('not_found')
        }
        if (other.archivedAt || other.deletedAt) throw new Refused('archived')
        if (
          (identity.organizationId === null &&
            other.projectId !== board.projectId) ||
          (await check(
            tx,
            sql`${below(taskId, other.id)} or ${below(other.id, taskId)}`
          ))
        ) {
          throw new Refused('invalid_link')
        }
        const [blocking, blocked] =
          link.kind === 'blockedBy' ? [other.id, taskId] : [taskId, other.id]
        if (await check(tx, blocksInTurn(blocked, blocking))) {
          throw new Refused('link_cycle')
        }
        await tx
          .insert(taskLinks)
          .values({
            blockingTaskId: blocking,
            blockedTaskId: blocked,
            organizationId: task.organizationId
          })
          .onConflictDoNothing()
        if (other.boardId !== boardId) {
          await bumpBoards(tx, eq(boards.id, other.boardId))
        }
        return null
      })
    },

    removeLink(
      identity: Identity,
      boardId: string,
      taskId: string,
      otherId: string
    ) {
      return writeOrRefuse(db, identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        await bumpBoard(tx, boardId)
        await shownTaskOf(tx, boardId, taskId)
        const removed = await tx
          .delete(taskLinks)
          .where(
            or(
              and(
                eq(taskLinks.blockingTaskId, taskId),
                eq(taskLinks.blockedTaskId, otherId)
              ),
              and(
                eq(taskLinks.blockingTaskId, otherId),
                eq(taskLinks.blockedTaskId, taskId)
              )
            )
          )
          .returning({ id: taskLinks.blockedTaskId })
        if (removed.length === 0) throw new Refused('not_found')
        const [other] = await tx
          .select({ boardId: tasks.boardId })
          .from(tasks)
          .where(eq(tasks.id, otherId))
        if (other && other.boardId !== boardId) {
          await bumpBoards(tx, eq(boards.id, other.boardId))
        }
        return null
      })
    }
  }
}
