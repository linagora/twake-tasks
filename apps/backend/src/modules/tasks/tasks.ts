import { and, asc, desc, eq, ne, notInArray, sql } from 'drizzle-orm'
import { generateKeyBetween } from 'fractional-indexing'
import type { Db, Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { checkRole, membersOf, roleOn } from '../boards/access.ts'
import {
  daysBetween,
  nextOccurrence,
  recurrenceOf,
  shift,
  todayIn,
  type Recurrence
} from '../boards/recurrence.ts'
import { boards, taskAssignees, tasks } from '../boards/schema.ts'
import {
  completionFor,
  inSection,
  positionBetween,
  sectionOf,
  shownTaskOf,
  taskOf
} from '../boards/taskRows.ts'
import { bumpBoard } from '../boards/versions.ts'
import { Refused, writeOrRefuse } from '../kernel/index.ts'
import { plainText } from './markdown.ts'
import { moveReminders } from './reminderJobs.ts'

export async function visibleTask(
  tx: Tx,
  identity: Identity,
  boardId: string,
  taskId: string
) {
  if (!(await roleOn(tx, identity.userId, boardId))) {
    throw new Refused('not_found')
  }
  return taskOf(tx, boardId, taskId)
}

export async function refuseIfShelved(
  tx: Tx,
  boardId: string,
  task: { archivedAt: Date | null; deletedAt: Date | null }
) {
  const [board] = await tx
    .select({ archivedAt: boards.archivedAt })
    .from(boards)
    .where(eq(boards.id, boardId))
  if (board?.archivedAt || task.archivedAt || task.deletedAt) {
    throw new Refused('archived')
  }
}

const MAX_DEPTH = 4

async function depthOf(tx: Tx, taskId: string): Promise<number> {
  const [chain] = await tx.execute<{ depth: number }>(sql`
    with recursive chain as (
      select ${tasks.id}, ${tasks.parentId} from ${tasks} where ${tasks.id} = ${taskId}
      union all
      select parent.id, parent.parent_id from ${tasks} parent
      join chain on parent.id = chain.parent_id
    )
    select count(*)::int as depth from chain`)
  return chain?.depth ?? 0
}

type Maybe<T> = T | undefined

export interface TaskChanges {
  title?: Maybe<string>
  priority?: Maybe<number | null>
  dueDate?: Maybe<string | null>
  dueTime?: Maybe<string | null>
  dueZone?: Maybe<string | null>
  deadline?: Maybe<string | null>
  duration?: Maybe<{ amount: number; unit: 'minutes' | 'days' } | null>
  recurrence?: Maybe<Recurrence | null>
}

// Clearing the due date clears its time and its recurrence, and clearing the
// time its zone.
function withDates(task: typeof tasks.$inferSelect, changes: TaskChanges) {
  const { duration, recurrence, ...fields } = changes
  const dueDate = changes.dueDate === undefined ? task.dueDate : changes.dueDate
  const dueTime =
    dueDate === null
      ? null
      : changes.dueTime === undefined
        ? task.dueTime
        : changes.dueTime
  if ((changes.dueTime || recurrence) && dueDate === null) {
    throw new Refused('invalid_dates')
  }
  const deadline =
    changes.deadline === undefined ? task.deadline : changes.deadline
  // Only an edit of either date is checked, so a task saved before this rule
  // can still be renamed.
  if (
    (changes.dueDate !== undefined || changes.deadline !== undefined) &&
    dueDate !== null &&
    deadline !== null &&
    deadline < dueDate
  ) {
    throw new Refused('invalid_dates')
  }
  const rule = dueDate === null ? null : recurrence
  return {
    ...fields,
    ...(rule !== undefined && {
      recurEvery: rule?.every ?? null,
      recurUnit: rule?.unit ?? null,
      recurFromCompletion: rule?.fromCompletion ?? false
    }),
    dueTime,
    dueZone:
      dueTime === null
        ? null
        : changes.dueZone === undefined
          ? task.dueZone
          : changes.dueZone,
    ...(duration !== undefined && {
      duration: duration?.amount ?? null,
      durationUnit: duration?.unit ?? null
    })
  }
}

function nextDates(
  dueDate: string,
  deadline: string | null,
  rule: Recurrence,
  zone: string | null
) {
  const today = todayIn(zone)
  try {
    const next = nextOccurrence(dueDate, rule, today)
    return {
      dueDate: next,
      ...(deadline !== null && {
        deadline: shift(deadline, daysBetween(dueDate, next), 'days')
      })
    }
  } catch (error) {
    if (error instanceof RangeError) throw new Refused('invalid_dates')
    throw error
  }
}

// A recurring task stays open: completing it records the completion and moves
// the due date to the next occurrence. Returns false for any other task.
async function recur(tx: Tx, task: typeof tasks.$inferSelect) {
  const rule = recurrenceOf(task)
  if (!rule || task.dueDate === null) return false
  const dates = nextDates(task.dueDate, task.deadline, rule, task.dueZone)
  await tx.execute(
    sql`select log_task_change(${task.id}, ${task.organizationId}, 'completion', null, '"completed"'::jsonb)`
  )
  await tx.update(tasks).set(dates).where(eq(tasks.id, task.id))
  await moveReminders(tx, task.id)
  return true
}

export function createTaskStore(db: Db) {
  const write = <T>(identity: Identity, work: (tx: Tx) => Promise<T>) =>
    writeOrRefuse(db, identity, work)

  return {
    createTask(
      identity: Identity,
      boardId: string,
      input: { title: string } & (
        { sectionId: string | null } | { parentId: string }
      )
    ) {
      return write(identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        const board = await bumpBoard(tx, boardId, {
          taskCounter: sql`${boards.taskCounter} + 1`
        })
        const sectionId = 'sectionId' in input ? input.sectionId : null
        const parentId = 'parentId' in input ? input.parentId : null
        const section = await sectionOf(tx, boardId, sectionId)
        if (parentId !== null) {
          const [parent] = await tx
            .select({
              archivedAt: tasks.archivedAt,
              deletedAt: tasks.deletedAt
            })
            .from(tasks)
            .where(and(eq(tasks.id, parentId), eq(tasks.boardId, boardId)))
          if (!parent) throw new Refused('invalid_parent')
          if (parent.archivedAt || parent.deletedAt) {
            throw new Refused('archived')
          }
          if ((await depthOf(tx, parentId)) >= MAX_DEPTH) {
            throw new Refused('too_deep')
          }
        }
        const [last] = await tx
          .select({ position: tasks.position })
          .from(tasks)
          .where(
            parentId === null
              ? inSection(boardId, sectionId)
              : and(eq(tasks.boardId, boardId), eq(tasks.parentId, parentId))
          )
          .orderBy(desc(tasks.position))
          .limit(1)
        const [task] = await tx
          .insert(tasks)
          .values({
            boardId,
            sectionId,
            parentId,
            organizationId: board.organizationId,
            number: board.number,
            title: input.title,
            position: generateKeyBetween(last?.position ?? null, null),
            createdBy: identity.userId,
            ...completionFor(section?.category ?? null)
          })
          .returning()
        if (!task) throw new Error('task insert returned nothing')
        return {
          id: task.id,
          key: `${board.keyPrefix}-${String(task.number)}`,
          title: task.title,
          sectionId: task.sectionId
        }
      })
    },

    moveTask(
      identity: Identity,
      boardId: string,
      taskId: string,
      input: {
        sectionId: string | null
        afterId?: string | undefined
        beforeId?: string | undefined
      }
    ) {
      return write(identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        await bumpBoard(tx, boardId)
        const section = await sectionOf(tx, boardId, input.sectionId)
        const task = await shownTaskOf(tx, boardId, taskId)
        if (task.parentId !== null) throw new Refused('invalid_section')
        if (section?.category === 'completed' && (await recur(tx, task))) {
          return null
        }
        const others = await tx
          .select({
            id: tasks.id,
            position: tasks.position,
            hidden: sql<boolean>`${tasks.archivedAt} is not null or ${tasks.deletedAt} is not null`
          })
          .from(tasks)
          .where(and(inSection(boardId, input.sectionId), ne(tasks.id, taskId)))
          .orderBy(asc(tasks.position))
        await tx
          .update(tasks)
          .set({
            sectionId: input.sectionId,
            position: positionBetween(others, input.afterId, input.beforeId),
            ...completionFor(section?.category ?? null, task)
          })
          .where(eq(tasks.id, taskId))
        return null
      })
    },

    editTask(
      identity: Identity,
      boardId: string,
      taskId: string,
      changes: TaskChanges
    ) {
      return write(identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        await bumpBoard(tx, boardId)
        const task = await shownTaskOf(tx, boardId, taskId)
        await tx
          .update(tasks)
          .set(withDates(task, changes))
          .where(eq(tasks.id, taskId))
        await moveReminders(tx, taskId)
        return null
      })
    },

    // A task in a section completes by moving to a completed section.
    completeTask(
      identity: Identity,
      boardId: string,
      taskId: string,
      state: 'completed' | 'canceled' | null
    ) {
      return write(identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        await bumpBoard(tx, boardId)
        const task = await shownTaskOf(tx, boardId, taskId)
        if (task.sectionId !== null) throw new Refused('invalid_section')
        if (state === 'completed' && (await recur(tx, task))) return null
        await tx
          .update(tasks)
          .set(completionFor(state, task))
          .where(eq(tasks.id, taskId))
        return null
      })
    },

    getDescription(identity: Identity, boardId: string, taskId: string) {
      return write(identity, async tx => {
        if (!(await roleOn(tx, identity.userId, boardId))) {
          throw new Refused('not_found')
        }
        const task = await taskOf(tx, boardId, taskId)
        return { markdown: task.description, version: task.descriptionVersion }
      })
    },

    setDescription(
      identity: Identity,
      boardId: string,
      taskId: string,
      edit: { markdown: string; version: number }
    ) {
      return write(identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        await bumpBoard(tx, boardId)
        const task = await shownTaskOf(tx, boardId, taskId)
        if (task.descriptionVersion !== edit.version) {
          throw new Refused('stale_version')
        }
        const version = edit.version + 1
        await tx
          .update(tasks)
          .set({
            description: edit.markdown,
            descriptionText: plainText(edit.markdown),
            descriptionVersion: version
          })
          .where(eq(tasks.id, taskId))
        return { version }
      })
    },

    setAssignees(
      identity: Identity,
      boardId: string,
      taskId: string,
      userIds: string[]
    ) {
      return write(identity, async tx => {
        await checkRole(tx, identity, boardId, 'editor')
        const board = await bumpBoard(tx, boardId)
        const task = await shownTaskOf(tx, boardId, taskId)
        const members = await membersOf(tx, board)
        if (
          !userIds.every(userId =>
            members.some(member => member.userId === userId)
          )
        ) {
          throw new Refused('invalid_assignee')
        }
        await tx
          .delete(taskAssignees)
          .where(
            and(
              eq(taskAssignees.taskId, taskId),
              notInArray(taskAssignees.userId, userIds)
            )
          )
        if (userIds.length > 0) {
          await tx
            .insert(taskAssignees)
            .values(
              [...new Set(userIds)].map(userId => ({
                taskId,
                organizationId: task.organizationId,
                userId
              }))
            )
            .onConflictDoNothing()
        }
        return null
      })
    }
  }
}
