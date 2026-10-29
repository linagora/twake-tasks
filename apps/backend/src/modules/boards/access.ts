import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm'
import type { Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { Refused } from '../kernel/index.ts'
import type { LiveBoards } from '../live/index.ts'
import { userSettings } from '../settings/index.ts'
import { boards, projectInvites, projectMembers, projects } from './schema.ts'
import { bumpProjects } from './versions.ts'

export type Role = 'viewer' | 'editor' | 'admin'

// Every permission check goes through this query: a board takes the person's
// role in its project.
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

// The emails invited to the project, not members until they sign in.
export async function invitedTo(tx: Tx, projectId: string): Promise<string[]> {
  const rows = await tx
    .select({ email: projectInvites.email })
    .from(projectInvites)
    .where(eq(projectInvites.projectId, projectId))
    .orderBy(asc(projectInvites.email))
  return rows.map(row => row.email)
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

// Someone not on the board keeps the name they had when they wrote, else
// their email.
export async function looksOn(
  tx: Tx,
  boardId: string
): Promise<(userId: string | null, nameThen?: string | null) => Looks> {
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

export async function roleOn(
  tx: Tx,
  userId: string,
  boardId: string
): Promise<Role | null> {
  const accessible = accessibleBoards(tx, userId)
  const [row] = await tx
    .select({ role: accessible.role })
    .from(accessible)
    .where(eq(accessible.boardId, boardId))
  return row?.role ?? null
}

export const liveBoards: LiveBoards = {
  canView: async (tx, userId, boardId) => {
    await claimInvites(tx)
    return (await roleOn(tx, userId, boardId)) !== null
  },
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
