import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  notExists,
  sql
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { generateNKeysBetween } from 'fractional-indexing'
import {
  inTenant,
  isUniqueViolation,
  type Db,
  type Tx
} from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { Refused, writeOrRefuse, type Result } from '../kernel/index.ts'
import { userSettings } from '../settings/index.ts'
import {
  describedColumns,
  describedExtras,
  describeRead,
  shown
} from './describe.ts'
import {
  accessibleBoards,
  checkRole,
  claimInvites,
  firstMembersOfProjects,
  memberLooks,
  roleIn,
  roleOn,
  settingsOfMember,
  type Member
} from './access.ts'
import {
  sections,
  boardFavorites,
  boards,
  projectInvites,
  projectMembers,
  projects,
  tasks
} from './schema.ts'
import { copyBoard, type CopyOptions } from './copy.ts'
import { bumpBoard, bumpBoards } from './versions.ts'
import { freeKeyPrefix, INBOX_KEY_PREFIX } from './keyPrefixes.ts'
import { languageOf, type Language } from './mailLayout.ts'
import { todayIn } from './recurrence.ts'

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

    setBoardArchived(identity: Identity, boardId: string, archived: boolean) {
      return writeOrRefuse(db, identity, async tx => {
        await checkRole(tx, identity, boardId, 'admin')
        const [board] = await bumpBoards(
          tx,
          and(eq(boards.id, boardId), eq(boards.inbox, false)),
          {
            archivedAt: archived
              ? sql`coalesce(${boards.archivedAt}, now())`
              : null
          }
        )
        if (!board) throw new Refused('forbidden')
        return null
      })
    },

    setBoardTemplate(identity: Identity, boardId: string, on: boolean) {
      return writeOrRefuse(db, identity, async tx => {
        await checkRole(tx, identity, boardId, 'admin')
        const [board] = await bumpBoards(
          tx,
          and(eq(boards.id, boardId), eq(boards.inbox, false)),
          { boardTemplate: on }
        )
        if (!board) throw new Refused('forbidden')
        return null
      })
    },

    /** Late tasks are the open ones due before today in `zone`. */
    listBoards(identity: Identity, zone: string | null = null) {
      const today = todayIn(zone)
      return inTenant(db, identity, async tx => {
        await settleSignIn(tx, identity)
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
            background: boards.background,
            backgroundColor: boards.backgroundColor,
            backgroundImage: boards.backgroundImage,
            role: accessible.role,
            joinedAt: accessible.joinedAt,
            sharedBy: sql<{ name: string | null; email: string } | null>`
              case when ${inviter.userId} is null then null
              else json_build_object(
                'name', coalesce(${inviterSettings.name}, ${inviter.name}),
                'email', ${inviter.email}
              ) end`,
            archived: sql<boolean>`${boards.archivedAt} is not null`,
            boardTemplate: boards.boardTemplate,
            favorite: sql<boolean>`${boardFavorites.userId} is not null`
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
        const counts = await taskCountsOf(
          tx,
          listed.map(board => board.id),
          today
        )
        const members = await firstMembersOfProjects(tx, [
          ...new Set(listed.map(board => board.project.id))
        ])
        return listed.map(board => ({
          ...board,
          ...(counts.get(board.id) ?? NO_TASKS),
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

    /** Whether a new board may use `wanted`, and a free prefix close to it. */
    keyPrefixFor(identity: Identity, wanted: string) {
      return inTenant(db, identity, async tx => {
        const suggestion = await freeKeyPrefix(
          tx,
          identity.organizationId,
          wanted
        )
        return { available: suggestion === wanted, suggestion }
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
        copyOf?: CopyOptions | undefined
      }
    ): Promise<Result<NonNullable<Awaited<ReturnType<typeof loadBoard>>>>> {
      try {
        return await writeOrRefuse(db, identity, async tx => {
          const source =
            input.copyOf &&
            (await copySource(tx, identity, input.copyOf.boardId))
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
          if (source && input.copyOf) {
            await copyBoard(tx, identity, source, board, input.copyOf)
          } else await addDefaultSections(tx, board, input.language)
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

// Whoever sees a board may copy it into a board of their own.
async function copySource(tx: Tx, identity: Identity, boardId: string) {
  const [source] = await tx.select().from(boards).where(eq(boards.id, boardId))
  if (!source || !(await roleOn(tx, identity.userId, boardId))) {
    throw new Refused('not_found')
  }
  return source
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

const NO_TASKS = { openTasks: 0, doneTasks: 0, totalTasks: 0, lateTasks: 0 }

async function taskCountsOf(tx: Tx, boardIds: string[], today: string) {
  const byBoard = new Map<string, typeof NO_TASKS>()
  if (boardIds.length === 0) return byBoard
  const open = isNull(tasks.completedAt)
  const rows = await tx
    .select({
      boardId: tasks.boardId,
      openTasks: sql`count(*) filter (where ${open})`.mapWith(Number),
      doneTasks:
        sql`count(*) filter (where ${isNotNull(tasks.completedAt)})`.mapWith(
          Number
        ),
      totalTasks: sql`count(*)`.mapWith(Number),
      lateTasks:
        sql`count(*) filter (where ${and(open, lt(tasks.dueDate, today))})`.mapWith(
          Number
        )
    })
    .from(tasks)
    .where(
      and(
        inArray(tasks.boardId, boardIds),
        isNull(tasks.parentId),
        isNull(tasks.canceledAt),
        shown
      )
    )
    .groupBy(tasks.boardId)
  for (const { boardId, ...counts } of rows) byBoard.set(boardId, counts)
  return byBoard
}

// The boards list is polled, so one read finds which of the sign-in writes
// are owed and the others are skipped.
async function settleSignIn(tx: Tx, identity: Identity) {
  const renamed =
    identity.name === null
      ? sql`false`
      : sql`exists (select 1 from ${projectMembers}
          where ${projectMembers.userId} = ${identity.userId}
          and ${projectMembers.name} is distinct from ${identity.name})`
  const [owed] = await tx.execute<{
    inbox: boolean
    invites: boolean
    renamed: boolean
  }>(sql`select
    not exists (select 1 from ${projects}
      where ${projects.personal} and ${projects.createdBy} = ${identity.userId}
      and ${projects.organizationId} is not distinct from ${identity.organizationId}) as "inbox",
    exists (select 1 from ${projectInvites}
      where ${projectInvites.email} = lower(${identity.email})) as "invites",
    ${renamed} as "renamed"`)
  if (owed?.inbox) await ensureInbox(tx, identity)
  if (owed?.invites) await claimInvites(tx)
  // A claimed invite becomes a membership with no name.
  if ((owed?.renamed || owed?.invites) && identity.name !== null) {
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

const me = alias(projectMembers, 'me')

type SectionCategory = (typeof sections.$inferSelect)['category']
type Layout = (typeof boards.$inferSelect)['layout']

// Two statements, the board then its tasks: each statement is a round trip,
// and a board is opened more than any other page. The role is the one
// `standingOn` reads.
async function loadBoard(tx: Tx, boardId: string, userId: string) {
  const [found] = await tx
    .select({
      board: boards,
      project: projectSummary,
      role: me.role,
      sections: sql<{ id: string; name: string; category: SectionCategory }[]>`
        coalesce((select json_agg(json_build_object(
          'id', s.id, 'name', s.name, 'category', s.category
        ) order by s.position) from sections s
        where s.board_id = ${boards.id}), '[]')`,
      members: sql<Member[]>`coalesce((select json_agg(json_build_object(
          'userId', ${projectMembers.userId},
          'email', ${projectMembers.email},
          'name', ${memberLooks.name},
          'avatar', ${memberLooks.avatar}
        ) order by ${projectMembers.email})
        from ${projectMembers} left join ${userSettings} on ${settingsOfMember}
        where ${projectMembers.projectId} = ${boards.projectId}), '[]')`,
      invited: sql<string[]>`case when ${me.role} = 'admin' then coalesce((
          select json_agg(i.email order by i.email) from project_invites i
          where i.project_id = ${boards.projectId}), '[]')
        else '[]' end`,
      labels: sql<{ id: string; name: string; color: string | null }[]>`
        coalesce((select json_agg(json_build_object(
          'id', l.id, 'name', l.name, 'color', l.color
        ) order by l.name) from labels l
        where l.project_id = ${boards.projectId}), '[]')`,
      picked: sql<Layout | null>`(select bl.layout from board_layouts bl
        where bl.board_id = ${boards.id} and bl.user_id = ${userId})`
    })
    .from(boards)
    .innerJoin(
      projects,
      and(eq(projects.id, boards.projectId), isNull(projects.deletedAt))
    )
    .innerJoin(me, and(eq(me.projectId, projects.id), eq(me.userId, userId)))
    .where(eq(boards.id, boardId))
  if (!found) return null
  const { board, project, role, members, invited, picked } = found
  const rows = await tx
    .select({ ...describedColumns, ...describedExtras })
    .from(tasks)
    .where(and(eq(tasks.boardId, boardId), shown))
    .orderBy(asc(tasks.position))
  return {
    layout: picked ?? board.layout,
    defaultLayout: board.layout,
    id: board.id,
    name: board.name,
    keyPrefix: board.keyPrefix,
    project,
    inbox: board.inbox,
    background: board.background,
    backgroundColor: board.backgroundColor,
    backgroundImage: board.backgroundImage,
    archived: board.archivedAt !== null,
    boardTemplate: board.boardTemplate,
    version: board.version,
    role,
    members,
    invited,
    labels: found.labels,
    sections: found.sections,
    tasks: describeRead(board, rows, members, found.labels)
  }
}
