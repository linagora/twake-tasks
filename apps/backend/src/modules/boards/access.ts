import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm'
import { inTenant, shareTransaction, type Db, type Tx } from '../../infra/db.ts'
import type {
  BoardAccess,
  CheckBoardAccess,
  CheckProjectAccess
} from '../../infra/route.ts'
import type { Identity } from '../auth/index.ts'
import { Refused } from '../kernel/index.ts'
import type { LiveBoards } from '../live/index.ts'
import { userSettings } from '../settings/index.ts'
import { boards, projectMembers, projects } from './schema.ts'
import { bumpProjects } from './versions.ts'

export type Role = 'viewer' | 'editor' | 'admin'

// A board takes the person's role in its project. `standingOn` spells the
// same join out for the per-request check, and `loadBoard` for opening a
// board: change all three together.
export function accessibleBoards(tx: Tx, userId: string) {
  return tx
    .select({
      boardId: boards.id,
      role: projectMembers.role,
      joinedAt: projectMembers.joinedAt,
      invitedBy: projectMembers.invitedBy
    })
    .from(boards)
    .innerJoin(
      projects,
      and(eq(projects.id, boards.projectId), isNull(projects.deletedAt))
    )
    .innerJoin(
      projectMembers,
      and(
        eq(projectMembers.projectId, projects.id),
        eq(projectMembers.userId, userId)
      )
    )
    .as('accessible')
}

export async function claimInvites(tx: Tx) {
  const joined = await tx.execute<{ projectId: string }>(
    sql`select app_claim_invites() as "projectId"`
  )
  await bumpProjects(
    tx,
    joined.map(row => row.projectId)
  )
}

export interface Member {
  userId: string
  email: string
  name: string | null
  avatar: string | null
}

export const settingsOfMember = eq(
  userSettings.email,
  sql`lower(${projectMembers.email})`
)

// The name a member chose in their Twake Workplace settings, else the one
// they last signed in with.
export const memberLooks = {
  name: sql<
    string | null
  >`coalesce(${userSettings.name}, ${projectMembers.name})`,
  avatar: userSettings.avatar
}

export async function memberNames(
  tx: Tx,
  projectIds: string[],
  emails: string[]
): Promise<(projectId: string, email: string) => string | null | undefined> {
  if (emails.length === 0) return () => undefined
  const members = await tx
    .select({
      projectId: projectMembers.projectId,
      email: projectMembers.email,
      name: memberLooks.name
    })
    .from(projectMembers)
    .leftJoin(userSettings, settingsOfMember)
    .where(
      and(
        inArray(projectMembers.projectId, projectIds),
        inArray(sql`lower(${projectMembers.email})`, emails)
      )
    )
  const names = new Map(
    members.map(member => [
      `${member.projectId} ${member.email.toLowerCase()}`,
      member.name
    ])
  )
  return (projectId, email) => names.get(`${projectId} ${email}`)
}

// The people who can open a board: the members of its project.
export function membersOf(
  tx: Tx,
  board: { projectId: string }
): Promise<Member[]> {
  return tx
    .select({
      userId: projectMembers.userId,
      email: projectMembers.email,
      ...memberLooks
    })
    .from(projectMembers)
    .leftJoin(userSettings, settingsOfMember)
    .where(eq(projectMembers.projectId, board.projectId))
    .orderBy(asc(projectMembers.email))
}

export async function membersOfProjects(
  tx: Tx,
  projectIds: string[]
): Promise<Map<string, Member[]>> {
  const rows = await tx
    .select({
      projectId: projectMembers.projectId,
      userId: projectMembers.userId,
      email: projectMembers.email,
      ...memberLooks
    })
    .from(projectMembers)
    .leftJoin(userSettings, settingsOfMember)
    .where(inArray(projectMembers.projectId, projectIds))
    .orderBy(asc(projectMembers.email))
  const byProject = new Map<string, Member[]>()
  for (const { projectId, ...member } of rows) {
    const members = byProject.get(projectId)
    if (members) members.push(member)
    else byProject.set(projectId, [member])
  }
  return byProject
}

// As many as a board card draws.
const FIRST_MEMBERS = 3

interface FirstMembers {
  members: Member[]
  memberCount: number
}

// The first members of each of the projects and how many they are, in one
// query for a list of boards: a project can have hundreds.
export async function firstMembersOfProjects(
  tx: Tx,
  projectIds: string[]
): Promise<Map<string, FirstMembers>> {
  const byProject = new Map<string, FirstMembers>()
  if (projectIds.length === 0) return byProject
  const ranked = tx
    .select({
      projectId: projectMembers.projectId,
      userId: projectMembers.userId,
      email: projectMembers.email,
      name: memberLooks.name.as('name'),
      avatar: memberLooks.avatar,
      rank: sql<number>`row_number() over (
        partition by ${projectMembers.projectId}
        order by ${projectMembers.email}
      )`.as('rank'),
      memberCount: sql<number>`count(*) over (
        partition by ${projectMembers.projectId}
      )::int`.as('member_count')
    })
    .from(projectMembers)
    .leftJoin(userSettings, settingsOfMember)
    .where(inArray(projectMembers.projectId, projectIds))
    .as('ranked')
  const rows = await tx
    .select({
      projectId: ranked.projectId,
      userId: ranked.userId,
      email: ranked.email,
      name: ranked.name,
      avatar: ranked.avatar,
      memberCount: ranked.memberCount
    })
    .from(ranked)
    .where(lte(ranked.rank, FIRST_MEMBERS))
    .orderBy(asc(ranked.rank))
  for (const { projectId, memberCount, ...member } of rows) {
    const first = byProject.get(projectId)
    if (first) first.members.push(member)
    else byProject.set(projectId, { members: [member], memberCount })
  }
  return byProject
}

type Looks = Pick<Member, 'name' | 'avatar'>

export type LooksOf = (userId: string | null, nameThen?: string | null) => Looks

// Someone not on the board keeps the name they had when they wrote, else
// their email.
export async function looksOn(tx: Tx, boardId: string): Promise<LooksOf> {
  const rows = await tx
    .select({ userId: projectMembers.userId, ...memberLooks })
    .from(projectMembers)
    .innerJoin(boards, eq(boards.projectId, projectMembers.projectId))
    .leftJoin(userSettings, settingsOfMember)
    .where(eq(boards.id, boardId))
  const looks = new Map<string | null, Looks>(
    rows.map(({ userId, name, avatar }) => [userId, { name, avatar }])
  )
  return (userId, nameThen = null) =>
    looks.get(userId) ?? { name: nameThen, avatar: null }
}

// The role the route's check found, for the stores' check in the same
// transaction. Only a read shares its transaction with the check, and nothing
// after the check's own invite claim changes a role in it.
const checkedRoles = new WeakMap<Tx, Map<string, Role>>()

const roleKey = (userId: string, boardId: string) => `${userId} ${boardId}`

export async function roleOn(
  tx: Tx,
  userId: string,
  boardId: string
): Promise<Role | null> {
  const checked = checkedRoles.get(tx)?.get(roleKey(userId, boardId))
  if (checked) return checked
  const standing = await standingOn(tx, userId, boardId)
  return standing?.role ?? null
}

const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 }

// `accessibleBoards` for one board, written as text: every request runs it,
// and the query builder spends CPU building the same SQL each time.
async function standingOn(tx: Tx, userId: string, boardId: string) {
  const [row] = await tx.execute<{ role: Role; managed: boolean }>(sql`
    select m.role, p.managed
    from boards b
    join projects p on p.id = b.project_id and p.deleted_at is null
    join project_members m on m.project_id = p.id and m.user_id = ${userId}
    where b.id = ${boardId}`)
  return row
}

async function boardRefusal(
  tx: Tx,
  userId: string,
  params: { boardId: string; userId?: string },
  access: BoardAccess
): Promise<'not_found' | 'forbidden' | null> {
  let standing = await standingOn(tx, userId, params.boardId)
  if (!standing) {
    // They may hold an invite not claimed yet.
    await claimInvites(tx)
    standing = await standingOn(tx, userId, params.boardId)
  }
  if (!standing) return 'not_found'
  const roles = checkedRoles.get(tx) ?? new Map<string, Role>()
  checkedRoles.set(
    tx,
    roles.set(roleKey(userId, params.boardId), standing.role)
  )
  const onSelf = access.orSelf && params.userId === userId
  if (!onSelf && RANK[standing.role] < RANK[access.role]) return 'forbidden'
  if (access.refusedOnManaged && standing.managed) return 'forbidden'
  return null
}

export const checkBoardAccess =
  (db: Db): CheckBoardAccess<Identity> =>
  (identity, params, access) =>
    inTenant(db, identity, tx =>
      boardRefusal(tx, identity.userId, params, access)
    )

export const checkProjectAccess =
  (db: Db): CheckProjectAccess<Identity> =>
  (identity, params, access) =>
    inTenant(db, identity, async tx => {
      let role = await roleIn(tx, identity.userId, params.projectId)
      if (!role) {
        await claimInvites(tx)
        role = await roleIn(tx, identity.userId, params.projectId)
      }
      if (!role) return 'not_found'
      return RANK[role] < RANK[access.role] ? 'forbidden' : null
    })

export const accessChecks = (db: Db) => ({
  checkBoardAccess: checkBoardAccess(db),
  checkProjectAccess: checkProjectAccess(db),
  shareTransaction: <T>(identity: Identity, work: () => Promise<T>) =>
    shareTransaction(db, identity, work)
})

export const liveBoards: LiveBoards = {
  version: async (tx, boardId) => {
    const [row] = await tx
      .select({ version: boards.version })
      .from(boards)
      .where(eq(boards.id, boardId))
    if (!row) throw new Error(`board ${boardId} is gone`)
    return row.version
  }
}

export async function checkRole(
  tx: Tx,
  identity: Identity,
  boardId: string,
  needed: 'editor' | 'admin'
) {
  const role = await roleOn(tx, identity.userId, boardId)
  if (!role) throw new Refused('not_found')
  if (role === 'viewer' || (needed === 'admin' && role !== 'admin')) {
    throw new Refused('forbidden')
  }
}

export async function roleIn(
  tx: Tx,
  userId: string,
  projectId: string
): Promise<Role | null> {
  const [row] = await tx
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(
      projects,
      and(eq(projects.id, projectMembers.projectId), isNull(projects.deletedAt))
    )
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      )
    )
  return row?.role ?? null
}
