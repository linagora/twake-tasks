import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Tx } from '../../infra/db.ts'
import { userSettings } from '../settings/schema.ts'
import { boards, projectInvites, projectMembers, projects } from './schema.ts'
import { bumpBoards } from './tasks.ts'

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

/** Their open boards reload, members and roles included. */
export async function bumpProjects(tx: Tx, projectIds: string[]) {
  if (projectIds.length === 0) return
  await bumpBoards(tx, inArray(boards.projectId, projectIds))
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

// The emails invited to each of the projects, not members until they sign
// in. Only their admins see them.
export async function invitedTo(
  tx: Tx,
  projectIds: string[]
): Promise<Map<string, string[]>> {
  const byProject = new Map<string, string[]>()
  if (projectIds.length === 0) return byProject
  const rows = await tx
    .select({
      projectId: projectInvites.projectId,
      email: projectInvites.email
    })
    .from(projectInvites)
    .where(inArray(projectInvites.projectId, projectIds))
    .orderBy(asc(projectInvites.email))
  for (const { projectId, email } of rows) {
    const emails = byProject.get(projectId)
    if (emails) emails.push(email)
    else byProject.set(projectId, [email])
  }
  return byProject
}

type Looks = Pick<Member, 'name' | 'avatar'>

// Someone who left the board keeps their email on what they wrote, not a name.
export async function looksOn(
  tx: Tx,
  boardId: string
): Promise<(userId: string | null) => Looks> {
  const rows = await tx
    .select({ userId: projectMembers.userId, ...memberLooks })
    .from(projectMembers)
    .innerJoin(boards, eq(boards.projectId, projectMembers.projectId))
    .leftJoin(userSettings, settingsOfMember)
    .where(eq(boards.id, boardId))
  const looks = new Map<string | null, Looks>(
    rows.map(({ userId, name, avatar }) => [userId, { name, avatar }])
  )
  return userId => looks.get(userId) ?? { name: null, avatar: null }
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
