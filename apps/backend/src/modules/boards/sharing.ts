import {
  and,
  asc,
  count,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  notInArray,
  sql
} from 'drizzle-orm'
import { inTenant, type Db, type Tx } from '../../infra/db.ts'
import { schedule } from '../../scheduler/scheduler.ts'
import type { Identity } from '../auth/index.ts'
import { userSettings } from '../settings/schema.ts'
import {
  memberLooks,
  membersOf,
  roleIn,
  roleOn,
  settingsOfMember,
  type Role
} from './access.ts'
import { unfollowOutside, unfollowProject } from './followers.ts'
import {
  boards,
  inviteEmails,
  projectInvites,
  projectMembers,
  projects,
  taskAssignees,
  taskLabels,
  tasks
} from './schema.ts'
import { PROJECT_INVITE_EMAIL_JOB } from './inviteEmails.ts'
import { bumpBoard, checkRole, Refused, writeOrRefuse } from './tasks.ts'

async function projectOfBoard(tx: Tx, boardId: string) {
  const [project] = await tx
    .select({
      id: projects.id,
      organizationId: projects.organizationId,
      personal: projects.personal,
      managed: projects.managed
    })
    .from(boards)
    .innerJoin(projects, eq(projects.id, boards.projectId))
    .where(eq(boards.id, boardId))
  if (!project) throw new Refused('not_found')
  return project
}

// Sharing a board shares its project. A personal project stays private, and a
// managed one takes its members from its integration.
async function sharedProject(tx: Tx, identity: Identity, boardId: string) {
  await checkRole(tx, identity, boardId, 'admin')
  const project = await projectOfBoard(tx, boardId)
  if (project.personal || project.managed) throw new Refused('forbidden')
  return project
}

export const EMAILS_PER_ADDRESS_WINDOW_MS = 24 * 60 * 60 * 1000
export const EMAILS_PER_INVITER_WINDOW_MS = 60 * 60 * 1000
export const EMAILS_PER_INVITER = 20

// Anyone can make a board and invite any address, so the e-mail is limited
// to one per address and project a day, and 20 an hour per inviter. The
// invite itself is recorded either way.
async function mayEmail(
  tx: Tx,
  projectId: string,
  email: string,
  inviter: string
) {
  const since = (ms: number) => new Date(Date.now() - ms)
  // Nothing older than the longest window is needed: forget it. This reaches
  // the rows of the tenant the inviter is in, as row level security allows.
  await tx
    .delete(inviteEmails)
    .where(lt(inviteEmails.sentAt, since(EMAILS_PER_ADDRESS_WINDOW_MS)))
  const [sameAddress] = await tx
    .select({ n: count() })
    .from(inviteEmails)
    .where(
      and(
        eq(inviteEmails.projectId, projectId),
        eq(inviteEmails.email, email),
        gt(inviteEmails.sentAt, since(EMAILS_PER_ADDRESS_WINDOW_MS))
      )
    )
  if (sameAddress && sameAddress.n > 0) return false
  const [byInviter] = await tx
    .select({ n: count() })
    .from(inviteEmails)
    .where(
      and(
        eq(inviteEmails.invitedBy, inviter),
        gt(inviteEmails.sentAt, since(EMAILS_PER_INVITER_WINDOW_MS))
      )
    )
  return (byInviter?.n ?? 0) < EMAILS_PER_INVITER
}

async function keepAnAdmin(tx: Tx, projectId: string, leaving: string) {
  const [other] = await tx
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.role, 'admin'),
        ne(projectMembers.userId, leaving)
      )
    )
    .limit(1)
  if (!other) throw new Refused('last_admin')
}

export function createSharingStore(db: Db) {
  return {
    invite(identity: Identity, boardId: string, email: string, role: Role) {
      return writeOrRefuse(db, identity, async tx => {
        const project = await sharedProject(tx, identity, boardId)
        const [member] = await tx
          .select({ userId: projectMembers.userId })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, project.id),
              eq(sql`lower(${projectMembers.email})`, email)
            )
          )
        if (member) return
        const [existing] = await tx
          .select({ role: projectInvites.role })
          .from(projectInvites)
          .where(
            and(
              eq(projectInvites.projectId, project.id),
              eq(projectInvites.email, email)
            )
          )
        await tx
          .insert(projectInvites)
          .values({
            projectId: project.id,
            organizationId: project.organizationId,
            email,
            role,
            invitedBy: identity.userId
          })
          .onConflictDoUpdate({
            target: [projectInvites.projectId, projectInvites.email],
            set: { role }
          })
        // An e-mail goes out for a new invite or a change of role, within the
        // limits of mayEmail. The job reads the invite when it runs, so it
        // tells the role current at delivery.
        if (existing?.role === role) return
        // Serialises one inviter's requests, so the ceiling holds in parallel.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${identity.userId}, 0))`
        )
        if (!(await mayEmail(tx, project.id, email, identity.userId))) return
        await tx.insert(inviteEmails).values({
          projectId: project.id,
          organizationId: project.organizationId,
          email,
          invitedBy: identity.userId
        })
        await schedule(tx, {
          kind: PROJECT_INVITE_EMAIL_JOB,
          key: `project_invite_email:${project.id}:${email}`,
          payload: {
            projectId: project.id,
            email,
            boardId,
            invitedBy: identity.userId,
            organizationId: project.organizationId
          },
          runAt: new Date()
        })
      })
    },

    sharing(identity: Identity, boardId: string) {
      return writeOrRefuse(db, identity, async tx => {
        const project = await sharedProject(tx, identity, boardId)
        return {
          members: await tx
            .select({
              userId: projectMembers.userId,
              email: projectMembers.email,
              ...memberLooks,
              role: projectMembers.role
            })
            .from(projectMembers)
            .leftJoin(userSettings, settingsOfMember)
            .where(eq(projectMembers.projectId, project.id))
            .orderBy(asc(projectMembers.email)),
          invites: await tx
            .select({
              id: projectInvites.id,
              email: projectInvites.email,
              role: projectInvites.role
            })
            .from(projectInvites)
            .where(eq(projectInvites.projectId, project.id))
            .orderBy(asc(projectInvites.email))
        }
      })
    },

    cancelInvite(identity: Identity, boardId: string, inviteId: string) {
      return writeOrRefuse(db, identity, async tx => {
        const project = await sharedProject(tx, identity, boardId)
        await tx
          .delete(projectInvites)
          .where(
            and(
              eq(projectInvites.projectId, project.id),
              eq(projectInvites.id, inviteId)
            )
          )
      })
    },

    setRole(identity: Identity, boardId: string, userId: string, role: Role) {
      return writeOrRefuse(db, identity, async tx => {
        const project = await sharedProject(tx, identity, boardId)
        if (role !== 'admin') await keepAnAdmin(tx, project.id, userId)
        const updated = await tx
          .update(projectMembers)
          .set({ role })
          .where(
            and(
              eq(projectMembers.projectId, project.id),
              eq(projectMembers.userId, userId)
            )
          )
          .returning({ userId: projectMembers.userId })
        if (updated.length === 0) throw new Refused('not_found')
      })
    },

    myProjects(identity: Identity) {
      return inTenant(db, identity, tx =>
        tx
          .select({
            id: projects.id,
            name: projects.name,
            personal: projects.personal,
            managed: projects.managed,
            role: projectMembers.role
          })
          .from(projectMembers)
          .innerJoin(
            projects,
            and(
              eq(projects.id, projectMembers.projectId),
              isNull(projects.deletedAt)
            )
          )
          .where(eq(projectMembers.userId, identity.userId))
          .orderBy(asc(projects.name))
      )
    },

    // The board takes the target project's members and labels: its tasks
    // drop the labels and assignees the target does not have.
    moveToProject(identity: Identity, boardId: string, projectId: string) {
      return writeOrRefuse(db, identity, async tx => {
        await checkRole(tx, identity, boardId, 'admin')
        const [board] = await tx
          .select({
            projectId: boards.projectId,
            keyPrefix: boards.keyPrefix,
            inbox: boards.inbox
          })
          .from(boards)
          .where(eq(boards.id, boardId))
        if (!board) throw new Refused('not_found')
        if (board.inbox) throw new Refused('forbidden')
        if (board.projectId === projectId) return
        const role = await roleIn(tx, identity.userId, projectId)
        if (!role) throw new Refused('not_found')
        if (role === 'viewer') throw new Refused('forbidden')
        const [taken] = await tx
          .select({ id: boards.id })
          .from(boards)
          .where(
            and(
              eq(boards.projectId, projectId),
              eq(boards.keyPrefix, board.keyPrefix)
            )
          )
        if (taken) throw new Refused('key_prefix_taken')
        await bumpBoard(tx, boardId)
        await unfollowOutside(
          tx,
          tx
            .select({ id: tasks.id })
            .from(tasks)
            .where(eq(tasks.boardId, boardId)),
          projectId
        )
        await tx.update(boards).set({ projectId }).where(eq(boards.id, boardId))
        const boardTasks = tx
          .select({ id: tasks.id })
          .from(tasks)
          .where(eq(tasks.boardId, boardId))
        await tx
          .delete(taskLabels)
          .where(inArray(taskLabels.taskId, boardTasks))
        const members = await membersOf(tx, { projectId })
        await tx.delete(taskAssignees).where(
          and(
            inArray(taskAssignees.taskId, boardTasks),
            notInArray(
              taskAssignees.userId,
              members.map(member => member.userId)
            )
          )
        )
      })
    },

    // Anyone may leave; only an admin removes someone else. Leaving a project
    // takes its tasks off the person.
    removeMember(identity: Identity, boardId: string, userId: string) {
      return writeOrRefuse(db, identity, async tx => {
        let project
        if (userId === identity.userId) {
          if (!(await roleOn(tx, identity.userId, boardId))) {
            throw new Refused('not_found')
          }
          project = await projectOfBoard(tx, boardId)
          if (project.personal || project.managed) {
            throw new Refused('forbidden')
          }
        } else {
          project = await sharedProject(tx, identity, boardId)
        }
        await keepAnAdmin(tx, project.id, userId)
        // Before the membership goes: in a B2C tenant the tasks, and so their
        // followers, stop being visible to a member who has left.
        await unfollowProject(tx, [userId], project.id)
        const removed = await tx
          .delete(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, project.id),
              eq(projectMembers.userId, userId)
            )
          )
          .returning({ userId: projectMembers.userId })
        if (removed.length === 0) throw new Refused('not_found')
        await tx
          .delete(taskAssignees)
          .where(
            and(
              eq(taskAssignees.userId, userId),
              inArray(
                taskAssignees.taskId,
                tx
                  .select({ id: tasks.id })
                  .from(tasks)
                  .innerJoin(boards, eq(boards.id, tasks.boardId))
                  .where(eq(boards.projectId, project.id))
              )
            )
          )
      })
    }
  }
}
