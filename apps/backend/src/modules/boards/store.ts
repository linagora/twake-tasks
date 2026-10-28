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
  ne,
  notExists,
  or,
  sql,
  type SQL
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { generateNKeysBetween } from 'fractional-indexing'
import { inTenant, type Db, type Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { userSettings } from '../settings/schema.ts'
import { describeTasks, shown } from './describe.ts'
import {
  accessibleBoards,
  claimInvites,
  invitedTo,
  firstMembersOfProjects,
  membersOf,
  roleIn,
  roleOn
} from './access.ts'
import {
  sections,
  boardFavorites,
  boardLayouts,
  boards,
  projectMembers,
  projects,
  taskAssignees,
  tasks
} from './schema.ts'
import {
  bumpBoard,
  checkRole,
  isUniqueViolation,
  Refused,
  writeOrRefuse,
  type Result
} from './tasks.ts'
import { labelsOn } from './labels.ts'
import { languageOf, type Language } from './mailLayout.ts'
import { shift, todayIn } from './recurrence.ts'

const DEFAULT_SECTION_CATEGORIES = [
  'unstarted',
  'started',
  'completed'
] as const

const DEFAULT_SECTION_NAMES: Record<
  Language,
  readonly [string, string, string]
> = {
  en: ['To do', 'In progress', 'Done'],
  fr: ['À faire', 'En cours', 'Terminé'],
  de: ['Zu erledigen', 'In Arbeit', 'Erledigt'],
  it: ['Da fare', 'In corso', 'Fatto'],
  es: ['Por hacer', 'En curso', 'Hecho'],
  ru: ['К выполнению', 'В работе', 'Готово'],
  vi: ['Cần làm', 'Đang làm', 'Hoàn thành']
}

export const INBOX_KEY_PREFIX = 'INBOX'

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

export function createBoardStore(db: Db) {
  return {
    renameBoard(identity: Identity, boardId: string, name: string) {
      return writeOrRefuse(db, identity, async tx => {
        await checkRole(tx, identity, boardId, 'admin')
        await bumpBoard(tx, boardId)
        const [previous] = await tx
          .select({ name: boards.name })
          .from(boards)
          .where(eq(boards.id, boardId))
        const [board] = await tx
          .update(boards)
          .set({ name })
          .where(and(eq(boards.id, boardId), eq(boards.inbox, false)))
          .returning({ id: boards.id, projectId: boards.projectId })
        if (!board || !previous) throw new Refused('forbidden')
        // A board made without a project started one named after it, and the
        // UI offers no other way to rename that project. A matching name tells
        // that project apart from one a board was moved into.
        await tx
          .update(projects)
          .set({ name })
          .where(
            and(
              eq(projects.id, board.projectId),
              eq(projects.name, previous.name),
              eq(projects.managed, false),
              eq(projects.personal, false),
              notExists(
                tx
                  .select({ id: boards.id })
                  .from(boards)
                  .where(
                    and(
                      eq(boards.projectId, board.projectId),
                      ne(boards.id, board.id)
                    )
                  )
              )
            )
          )
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

    /** Tasks whose key starts with, or whose title or description contains, `text`, an exact key match first. */
    search(identity: Identity, text: string) {
      const pattern = text.replace(/[\\%_]/g, '\\$&')
      const keyMatches = (keyPattern: string) =>
        sql`(${boards.keyPrefix} || '-' || ${tasks.number} ilike ${keyPattern}
          or exists (select 1 from unnest(${tasks.previousKeys}) as key where key ilike ${keyPattern}))`
      return inTenant(db, identity, async tx => {
        // No index serves ilike under row level security, so the person's
        // boards are read first: the planner then scans only their tasks,
        // not every task of the organization.
        const accessible = accessibleBoards(tx, identity.userId)
        const boardIds = (
          await tx.select({ id: accessible.boardId }).from(accessible)
        ).map(board => board.id)
        const found = await tasksOf(
          tx,
          identity.userId,
          and(
            inArray(tasks.boardId, boardIds),
            or(
              keyMatches(`${pattern}%`),
              ilike(tasks.title, `%${pattern}%`),
              ilike(tasks.descriptionText, `%${pattern}%`)
            )
          ),
          SEARCH_LIMIT,
          sql`${keyMatches(pattern)} desc`
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
        await claimInvites(tx)
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
        const inviter = alias(projectMembers, 'inviter')
        const inviterSettings = alias(userSettings, 'inviter_settings')
        const listed = await tx
          .select({
            id: boards.id,
            name: boards.name,
            keyPrefix: boards.keyPrefix,
            project: projectSummary,
            inbox: boards.inbox,
            role: accessible.role,
            joinedAt: accessible.joinedAt,
            sharedBy: sql<{ name: string | null; email: string } | null>`
              case when ${inviter.userId} is null then null
              else json_build_object(
                'name', coalesce(${inviterSettings.name}, ${inviter.name}),
                'email', ${inviter.email}
              ) end`,
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
            inviter,
            and(
              eq(inviter.projectId, boards.projectId),
              eq(inviter.userId, accessible.invitedBy)
            )
          )
          .leftJoin(
            inviterSettings,
            eq(inviterSettings.email, sql`lower(${inviter.email})`)
          )
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
        const members = await firstMembersOfProjects(tx, [
          ...new Set(listed.map(board => board.project.id))
        ])
        return listed.map(board => ({
          ...board,
          ...(members.get(board.project.id) ?? { members: [], memberCount: 0 })
        }))
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
      input: {
        name: string
        keyPrefix: string
        projectId?: string | undefined
        language?: string | undefined
      }
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
          await addDefaultSections(tx, board, input.language)
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
      return inTenant(db, identity, async tx => {
        await claimInvites(tx)
        return loadBoard(tx, boardId, identity.userId)
      })
    }
  }
}

export async function addDefaultSections(
  tx: Tx,
  board: { id: string; organizationId: string | null },
  language?: string
) {
  const names = DEFAULT_SECTION_NAMES[languageOf(language)]
  const positions = generateNKeysBetween(
    null,
    null,
    DEFAULT_SECTION_CATEGORIES.length
  )
  await tx.insert(sections).values(
    DEFAULT_SECTION_CATEGORIES.map((category, index) => ({
      name: names[index] ?? '',
      category,
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
  const invited = role === 'admin' ? await invitedTo(tx, board.projectId) : []
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
    invited,
    labels: boardLabels,
    sections: sectionRows,
    tasks: await describeTasks(tx, board, rows, members, boardLabels)
  }
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
  limit?: number,
  first?: SQL
) {
  const accessible = accessibleBoards(tx, userId)
  const parent = alias(tasks, 'parent')
  const query = tx
    .select({
      task: tasks,
      board: boards,
      category: sections.category,
      parentTitle: parent.title
    })
    .from(tasks)
    .innerJoin(boards, eq(boards.id, tasks.boardId))
    .innerJoin(projects, eq(projects.id, boards.projectId))
    .innerJoin(accessible, eq(accessible.boardId, boards.id))
    .leftJoin(sections, eq(sections.id, tasks.sectionId))
    .leftJoin(parent, eq(parent.id, tasks.parentId))
    .where(and(shown, which))
    .orderBy(
      ...(first ? [first] : []),
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
  return rows.map(({ task, board, category, parentTitle }) => ({
    ...described.get(board.id)?.find(each => each.id === task.id),
    category,
    parentTitle,
    boardId: board.id,
    boardName: board.name,
    projectId: board.projectId
  }))
}
