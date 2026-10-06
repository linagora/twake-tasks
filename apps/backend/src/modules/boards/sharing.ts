import { and, asc, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm'
import { inTenant, type Db, type Tx } from '../../infra/db.ts'
import type { Identity } from '../auth/index.ts'
import { membersOf, roleIn, roleOn, type Role } from './access.ts'
import {
  boards,
  projectInvites,
  projectMembers,
  projects,
  taskAssignees,
  taskLabels,
  tasks
} from './schema.ts'
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
              name: projectMembers.name,
              role: projectMembers.role
            })
            .from(projectMembers)
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
