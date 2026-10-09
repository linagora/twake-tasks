import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  notExists,
  or,
  sql,
  type SQL
} from 'drizzle-orm'
import { generateNKeysBetween } from 'fractional-indexing'
import postgres from 'postgres'
import { inTenant, type Db, type Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import {
  accessibleBoards,
  membersOf,
  roleIn,
  roleOn,
  type Member
} from './access.ts'
import { shown } from './archive.ts'
import {
  sections,
  boardFavorites,
  boardLayouts,
  boards,
  comments,
  projectMembers,
  projects,
  taskAssignees,
  taskLabels,
  tasks
} from './schema.ts'
import {
  bumpBoard,
  checkRole,
  Refused,
  writeOrRefuse,
  type Result
} from './tasks.ts'
import { labelsOn } from './labels.ts'
import { recurrenceOf, shift, todayIn } from './recurrence.ts'

const DEFAULT_SECTIONS = [
  { name: 'To do', category: 'unstarted' },
  { name: 'In progress', category: 'started' },
  { name: 'Done', category: 'completed' }
] as const

export const INBOX_KEY_PREFIX = 'INBOX'

const UNIQUE_VIOLATION = '23505'

const SEARCH_LIMIT = 50

const WORDS_BEFORE = 5
const WORDS_AFTER = 8

function excerptOf(description: string, text: string): string | null {
  const words = description.split(/\s+/).filter(Boolean)
  const joined = words.join(' ')
  const at = joined.toLowerCase().indexOf(text.toLowerCase())
  if (at === -1) return null
  const wordAt = (offset: number) =>
    joined.slice(0, offset).split(' ').length - 1
  const from = Math.max(0, wordAt(at) - WORDS_BEFORE)
  const to = Math.min(words.length, wordAt(at + text.length) + 1 + WORDS_AFTER)
  return `${from > 0 ? '…' : ''}${words.slice(from, to).join(' ')}${to < words.length ? '…' : ''}`
}

function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined
  return (
    cause instanceof postgres.PostgresError && cause.code === UNIQUE_VIOLATION
  )
}

export function createBoardStore(db: Db) {
  return {
    renameBoard(identity: Identity, boardId: string, name: string) {
      return writeOrRefuse(db, identity, async tx => {
        await checkRole(tx, identity, boardId, 'admin')
        await bumpBoard(tx, boardId)
        const [board] = await tx
          .update(boards)
          .set({ name })
          .where(and(eq(boards.id, boardId), eq(boards.inbox, false)))
          .returning({ id: boards.id })
        if (!board) throw new Refused('forbidden')
        return null
      })
    },

    /** Overdue tasks, then those due within `days` days of today in `zone`. */
    agenda(identity: Identity, zone: string, days: number) {
      return inTenant(db, identity, async tx => {
        const today = todayIn(zone)
        return {
          today,
          tasks: await openTasksOf(
            tx,
            identity.userId,
            and(
              lt(tasks.dueDate, shift(today, days, 'days')),
              mine(tx, identity.userId)
            )
          )
        }
      })
    },

    /** Open tasks assigned to the person, dated ones first. */
    assignedTasks(identity: Identity) {
      return inTenant(db, identity, tx =>
        openTasksOf(tx, identity.userId, assignedTo(tx, identity.userId))
      )
    },

    /** Tasks whose key starts with, or whose title or description contains, `text`. */
    search(identity: Identity, text: string) {
      const pattern = text.replace(/[\\%_]/g, '\\$&')
      return inTenant(db, identity, async tx => {
        const found = await tasksOf(
          tx,
          identity.userId,
          or(
            sql`${boards.keyPrefix} || '-' || ${tasks.number} ilike ${`${pattern}%`}`,
            sql`exists (select 1 from unnest(${tasks.previousKeys}) as key where key ilike ${`${pattern}%`})`,
            ilike(tasks.title, `%${pattern}%`),
            ilike(tasks.descriptionText, `%${pattern}%`)
          ),
          SEARCH_LIMIT
        )
        const quoted = found.flatMap(task =>
          task.id && !task.title?.toLowerCase().includes(text.toLowerCase())
            ? [task.id]
            : []
        )
        const descriptions = new Map(
          quoted.length === 0
            ? []
            : (
                await tx
                  .select({ id: tasks.id, text: tasks.descriptionText })
                  .from(tasks)
                  .where(inArray(tasks.id, quoted))
              ).map(row => [row.id, row.text])
        )
        return found.map(task => ({
          ...task,
          excerpt: excerptOf(descriptions.get(task.id ?? '') ?? '', text)
        }))
      })
    },

    listBoards(identity: Identity) {
      return inTenant(db, identity, async tx => {
        await ensureInbox(tx, identity)
        await tx.execute(sql`select app_claim_invites()`)
        if (identity.name !== null) {
          await tx
            .update(projectMembers)
            .set({ name: identity.name })
            .where(
              and(
                eq(projectMembers.userId, identity.userId),
                sql`${projectMembers.name} is distinct from ${identity.name}`
              )
            )
        }
        const accessible = accessibleBoards(tx, identity.userId)
        return tx
          .select({
            id: boards.id,
            name: boards.name,
            keyPrefix: boards.keyPrefix,
            project: projectSummary,
            inbox: boards.inbox,
            role: accessible.role,
            archived: sql<boolean>`${boards.archivedAt} is not null`,
            favorite: sql<boolean>`${boardFavorites.userId} is not null`,
            openTasks: tx.$count(
              tasks,
              and(
                eq(tasks.boardId, boards.id),
                isNull(tasks.parentId),
                isNull(tasks.completedAt),
                isNull(tasks.canceledAt),
                shown
              )
            ),
            doneTasks: tx.$count(
              tasks,
              and(
                eq(tasks.boardId, boards.id),
                isNull(tasks.parentId),
                isNotNull(tasks.completedAt),
                isNull(tasks.canceledAt),
                shown
              )
            ),
            totalTasks: tx.$count(
              tasks,
              and(
                eq(tasks.boardId, boards.id),
                isNull(tasks.parentId),
                isNull(tasks.canceledAt),
                shown
              )
            )
          })
          .from(boards)
          .innerJoin(accessible, eq(accessible.boardId, boards.id))
          .innerJoin(projects, eq(projects.id, boards.projectId))
          .leftJoin(
            boardFavorites,
            and(
              eq(boardFavorites.boardId, boards.id),
              eq(boardFavorites.userId, identity.userId)
            )
          )
          .orderBy(
            desc(boards.inbox),
            sql`${boardFavorites.userId} is null`,
            asc(boards.name)
          )
      })
    },

    setFavorite(identity: Identity, boardId: string, favorite: boolean) {
      return inTenant(db, identity, async tx => {
        const [board] = await tx
          .select({ organizationId: boards.organizationId })
          .from(boards)
          .where(eq(boards.id, boardId))
        if (!board || !(await roleOn(tx, identity.userId, boardId))) {
          return false
        }
        if (favorite) {
          await tx
            .insert(boardFavorites)
            .values({
              boardId,
              organizationId: board.organizationId,
              userId: identity.userId
            })
            .onConflictDoNothing()
        } else {
          await tx
            .delete(boardFavorites)
            .where(
              and(
                eq(boardFavorites.boardId, boardId),
                eq(boardFavorites.userId, identity.userId)
              )
            )
        }
        return true
      })
    },

    // Without a project, the board starts a project of its own, named after it.
    async createBoard(
      identity: Identity,
      input: { name: string; keyPrefix: string; projectId?: string | undefined }
    ): Promise<Result<NonNullable<Awaited<ReturnType<typeof loadBoard>>>>> {
      try {
        return await writeOrRefuse(db, identity, async tx => {
          let projectId = input.projectId
          if (projectId === undefined) {
            projectId = await createProject(tx, identity, { name: input.name })
          } else {
            const role = await roleIn(tx, identity.userId, projectId)
            if (!role) throw new Refused('not_found')
            if (role !== 'admin') throw new Refused('forbidden')
          }
          const [board] = await tx
            .insert(boards)
            .values({
              organizationId: identity.organizationId,
              projectId,
              name: input.name,
              keyPrefix: input.keyPrefix,
              createdBy: identity.userId
            })
            .returning()
          if (!board) throw new Error('board insert returned nothing')
          await addDefaultSections(tx, board)
          const loaded = await loadBoard(tx, board.id, identity.userId)
          if (!loaded) throw new Error('new board is not visible')
          return loaded
        })
      } catch (error) {
        if (isUniqueViolation(error)) {
          return { ok: false, error: 'key_prefix_taken' }
        }
        throw error
      }
    },

    getBoard(identity: Identity, boardId: string) {
      return inTenant(db, identity, tx =>
        loadBoard(tx, boardId, identity.userId)
      )
    }
  }
}

export async function addDefaultSections(
  tx: Tx,
  board: { id: string; organizationId: string | null }
) {
  const positions = generateNKeysBetween(null, null, DEFAULT_SECTIONS.length)
  await tx.insert(sections).values(
    DEFAULT_SECTIONS.map((section, index) => ({
      ...section,
      boardId: board.id,
      organizationId: board.organizationId,
      position: positions[index] ?? ''
    }))
  )
}

const projectSummary = {
  id: projects.id,
  name: projects.name,
  personal: projects.personal,
  managed: projects.managed
}

// The creator of a user's project is its admin.
export async function createProject(
  tx: Tx,
  identity: Identity,
  input: { name: string }
): Promise<string> {
  const [project] = await tx
    .insert(projects)
    .values({
      organizationId: identity.organizationId,
      name: input.name,
      createdBy: identity.userId
    })
    .returning({ id: projects.id })
  if (!project) throw new Error('project insert returned nothing')
  await tx.insert(projectMembers).values({
    projectId: project.id,
    organizationId: identity.organizationId,
    userId: identity.userId,
    email: identity.email,
    name: identity.name,
    role: 'admin'
  })
  return project.id
}

// The personal project holds the Inbox. The Inbox has no sections: its tasks
// show under "No section". A unique conflict means both already exist.
async function ensureInbox(tx: Tx, identity: Identity) {
  const [personal] = await tx
    .insert(projects)
    .values({
      organizationId: identity.organizationId,
      name: 'Personal',
      personal: true,
      createdBy: identity.userId
    })
    .onConflictDoNothing()
    .returning({ id: projects.id })
  if (!personal) return
  await tx.insert(projectMembers).values({
    projectId: personal.id,
    organizationId: identity.organizationId,
    userId: identity.userId,
    email: identity.email,
    name: identity.name,
    role: 'admin'
  })
  await tx.insert(boards).values({
    organizationId: identity.organizationId,
    projectId: personal.id,
    name: 'Inbox',
    keyPrefix: INBOX_KEY_PREFIX,
    createdBy: identity.userId,
    inbox: true
  })
}

async function loadBoard(tx: Tx, boardId: string, userId: string) {
  const role = await roleOn(tx, userId, boardId)
  if (!role) return null
  const [found] = await tx
    .select({ board: boards, project: projectSummary })
    .from(boards)
    .innerJoin(projects, eq(projects.id, boards.projectId))
    .where(eq(boards.id, boardId))
  if (!found) return null
  const { board, project } = found
  const sectionRows = await tx
    .select({
      id: sections.id,
      name: sections.name,
      category: sections.category
    })
    .from(sections)
    .where(eq(sections.boardId, boardId))
    .orderBy(asc(sections.position))
  const rows = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.boardId, boardId), shown))
    .orderBy(asc(tasks.position))
  const members = await membersOf(tx, board)
  const boardLabels = await labelsOn(tx, board)
  const [picked] = await tx
    .select({ layout: boardLayouts.layout })
    .from(boardLayouts)
    .where(
      and(eq(boardLayouts.boardId, boardId), eq(boardLayouts.userId, userId))
    )
  return {
    layout: picked?.layout ?? board.layout,
    defaultLayout: board.layout,
    id: board.id,
    name: board.name,
    keyPrefix: board.keyPrefix,
    project,
    inbox: board.inbox,
    archived: board.archivedAt !== null,
    version: board.version,
    role,
    members,
    labels: boardLabels,
    sections: sectionRows,
    tasks: await describeTasks(tx, board, rows, members, boardLabels)
  }
}

export async function describeTasks(
  tx: Tx,
  board: typeof boards.$inferSelect,
  rows: (typeof tasks.$inferSelect)[],
  members: Member[],
  boardLabels: { id: string; name: string }[]
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

export const assignedTo = (tx: Tx, userId: string) =>
  exists(
    tx
      .select({ one: sql`1` })
      .from(taskAssignees)
      .where(
        and(
          eq(taskAssignees.taskId, tasks.id),
          eq(taskAssignees.userId, userId)
        )
      )
  )

// A task is someone's when it is assigned to them, or when it sits unassigned
// in one of their own projects. Unassigned tasks of a managed project belong
// to nobody yet.
const mine = (tx: Tx, userId: string) =>
  or(
    assignedTo(tx, userId),
    and(
      eq(projects.managed, false),
      notExists(
        tx
          .select({ one: sql`1` })
          .from(taskAssignees)
          .where(eq(taskAssignees.taskId, tasks.id))
      )
    )
  )

export function openTasksOf(tx: Tx, userId: string, which: SQL | undefined) {
  return tasksOf(
    tx,
    userId,
    and(
      isNull(boards.archivedAt),
      isNull(tasks.completedAt),
      isNull(tasks.canceledAt),
      which
    )
  )
}

async function tasksOf(
  tx: Tx,
  userId: string,
  which: SQL | undefined,
  limit?: number
) {
  const accessible = accessibleBoards(tx, userId)
  const query = tx
    .select({ task: tasks, board: boards })
    .from(tasks)
    .innerJoin(boards, eq(boards.id, tasks.boardId))
    .innerJoin(projects, eq(projects.id, boards.projectId))
    .innerJoin(accessible, eq(accessible.boardId, boards.id))
    .where(and(shown, which))
    .orderBy(
      sql`${tasks.dueDate} asc nulls last`,
      sql`${tasks.dueTime} asc nulls last`,
      sql`${tasks.priority} asc nulls last`,
      asc(boards.name),
      asc(tasks.number)
    )
  const rows = await (limit === undefined ? query : query.limit(limit))
  const described = new Map<string, Awaited<ReturnType<typeof describeTasks>>>()
  for (const board of new Map(
    rows.map(row => [row.board.id, row.board])
  ).values()) {
    described.set(
      board.id,
      await describeTasks(
        tx,
        board,
        rows.filter(row => row.board.id === board.id).map(row => row.task),
        await membersOf(tx, board),
        await labelsOn(tx, board)
      )
    )
  }
  return rows.map(({ task, board }) => ({
    ...described.get(board.id)?.find(each => each.id === task.id),
    boardId: board.id,
    boardName: board.name
  }))
}
