import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL
} from 'drizzle-orm'
import { z } from 'zod'
import type { OutgoingEvent, PlatformEvent } from '../../events/envelope.ts'
import { enqueue } from '../../events/outbox.ts'
import { parseOrDrop, type Handler } from '../../events/router.ts'
import { asOrganization, type Tx } from '../../infra/db.ts'
import {
  schedule,
  type Handler as JobHandler
} from '../../scheduler/scheduler.ts'
import {
  boards,
  memberRole,
  projectMembers,
  projects,
  taskAssignees,
  tasks
} from '../boards/schema.ts'
import { addDefaultSections } from '../boards/store.ts'
import { spaces } from './schema.ts'

const spaceEvent = z.looseObject({
  organizationId: z.string().min(1),
  id: z.uuid()
})

// People are keyed by entryUUID; one sent without it waits for the nightly
// reconciliation.
const member = z.looseObject({
  uuid: z.uuid().optional(),
  email: z.email(),
  role: z.enum(memberRole.enumValues)
})

const spaceCreated = spaceEvent.extend({
  name: z.string().min(1),
  members: z.array(member).default([])
})

const spaceUpdated = spaceEvent.extend({ name: z.string().min(1).optional() })

const membersChanged = spaceEvent.extend({ members: z.array(member).min(1) })

const person = z
  .looseObject({ uuid: z.uuid().optional(), email: z.email().optional() })
  .refine(p => p.uuid ?? p.email, 'needs a uuid or an email')

const membersRemoved = spaceEvent.extend({ members: z.array(person).min(1) })

const FALLBACK_KEY_PREFIX = 'TASK'

function keyPrefixOf(name: string) {
  const letters = name
    .normalize('NFD')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^[0-9]+/, '')
  return letters.slice(0, 3) || FALLBACK_KEY_PREFIX
}

type SpaceRef = z.infer<typeof spaceEvent>

/** The project kept for the space, deleted or not. */
export async function projectOf(
  tx: Tx,
  space: SpaceRef
): Promise<string | undefined> {
  const [row] = await tx
    .select({ projectId: spaces.projectId })
    .from(spaces)
    .where(eq(spaces.id, space.id))
  return row?.projectId
}

export async function upsertMembers(
  tx: Tx,
  space: SpaceRef,
  members: z.infer<typeof member>[]
) {
  const projectId = await projectOf(tx, space)
  if (!projectId) return
  // One upsert cannot touch a row twice, so a member listed twice keeps its last entry.
  const byUser = new Map(
    members.flatMap(({ uuid, email, role }) =>
      uuid
        ? [
            [
              uuid,
              {
                projectId,
                organizationId: space.organizationId,
                userId: uuid,
                email,
                role
              }
            ] as const
          ]
        : []
    )
  )
  if (byUser.size === 0) return
  await tx
    .insert(projectMembers)
    .values([...byUser.values()])
    .onConflictDoUpdate({
      target: [projectMembers.projectId, projectMembers.userId],
      set: { email: sql`excluded.email`, role: sql`excluded.role` }
    })
}

export async function provisioned(
  tx: Tx,
  space: SpaceRef
): Promise<OutgoingEvent> {
  const projectId = await projectOf(tx, space)
  if (!projectId) throw new Error(`space ${space.id} has no project`)
  return {
    specversion: '1.0',
    id: `tasks-space-provisioned-${space.id}`,
    source: 'twake://tasks',
    type: 'com.twake.tasks.space.provisioned.v1',
    twakeorg: space.organizationId,
    data: { space_id: space.id, resource: { kind: 'project', id: projectId } }
  }
}

export async function provisionSpace(
  tx: Tx,
  space: SpaceRef & { name: string }
): Promise<void> {
  if (await projectOf(tx, space)) return
  const [project] = await tx
    .insert(projects)
    .values({
      organizationId: space.organizationId,
      name: space.name,
      managed: true,
      createdBy: space.id
    })
    .returning({ id: projects.id })
  if (!project) throw new Error('project insert returned nothing')
  const [created] = await tx
    .insert(spaces)
    .values({
      id: space.id,
      organizationId: space.organizationId,
      projectId: project.id
    })
    .onConflictDoNothing()
    .returning({ id: spaces.id })
  if (!created) {
    await tx.delete(projects).where(eq(projects.id, project.id))
    return
  }
  const [board] = await tx
    .insert(boards)
    .values({
      organizationId: space.organizationId,
      projectId: project.id,
      name: space.name,
      keyPrefix: keyPrefixOf(space.name),
      createdBy: space.id
    })
    .returning({ id: boards.id, organizationId: boards.organizationId })
  if (!board) throw new Error('board insert returned nothing')
  await addDefaultSections(tx, board)
}

export async function renameSpace(tx: Tx, space: SpaceRef, name: string) {
  const projectId = await projectOf(tx, space)
  if (!projectId) return
  await tx.update(projects).set({ name }).where(eq(projects.id, projectId))
}

/** Takes the space's boards and its tasks away from these people. */
export async function removeMembers(
  tx: Tx,
  space: SpaceRef,
  which: SQL | undefined
): Promise<void> {
  const projectId = await projectOf(tx, space)
  if (!projectId) return
  const removed = await tx
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), which))
    .returning({ userId: projectMembers.userId })
  if (removed.length === 0) return
  await tx.delete(taskAssignees).where(
    and(
      inArray(
        taskAssignees.userId,
        removed.map(m => m.userId)
      ),
      inArray(
        taskAssignees.taskId,
        tx
          .select({ id: tasks.id })
          .from(tasks)
          .innerJoin(boards, eq(boards.id, tasks.boardId))
          .where(eq(boards.projectId, projectId))
      )
    )
  )
}

/** Hides the space's project now, and purges it after 30 days. */
export async function deleteSpace(tx: Tx, space: SpaceRef): Promise<void> {
  const projectId = await projectOf(tx, space)
  if (!projectId) return
  const [deleted] = await tx
    .update(projects)
    .set({ deletedAt: sql`now()` })
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .returning({ id: projects.id })
  if (!deleted) return
  await schedule(tx, {
    kind: PURGE_SPACE_JOB,
    key: `${PURGE_SPACE_JOB}:${space.id}`,
    payload: { projectId, organizationId: space.organizationId },
    runAt: new Date(Date.now() + PURGE_AFTER_MS)
  })
}

export function spaceRoutes(): ReadonlyMap<string, Handler<PlatformEvent>> {
  // A replay creates nothing, and publishes the same event again.
  const onCreated: Handler<PlatformEvent> = async (event, tx) => {
    const space = parseOrDrop(spaceCreated, event.body, event.routingKey)
    await asOrganization(tx, space.organizationId)
    await provisionSpace(tx, space)
    await upsertMembers(tx, space, space.members)
    await enqueue(tx, await provisioned(tx, space))
  }

  const onUpdated: Handler<PlatformEvent> = async (event, tx) => {
    const space = parseOrDrop(spaceUpdated, event.body, event.routingKey)
    if (space.name === undefined) return
    await asOrganization(tx, space.organizationId)
    await renameSpace(tx, space, space.name)
  }

  const onMembersChanged: Handler<PlatformEvent> = async (event, tx) => {
    const space = parseOrDrop(membersChanged, event.body, event.routingKey)
    await asOrganization(tx, space.organizationId)
    await upsertMembers(tx, space, space.members)
  }

  const onMembersRemoved: Handler<PlatformEvent> = async (event, tx) => {
    const space = parseOrDrop(membersRemoved, event.body, event.routingKey)
    await asOrganization(tx, space.organizationId)
    const uuids = space.members.flatMap(p => (p.uuid ? [p.uuid] : []))
    const emails = space.members.flatMap(p => (p.email ? [p.email] : []))
    await removeMembers(
      tx,
      space,
      or(
        inArray(projectMembers.userId, uuids),
        inArray(projectMembers.email, emails)
      )
    )
  }

  const onDeleted: Handler<PlatformEvent> = async (event, tx) => {
    const space = parseOrDrop(spaceEvent, event.body, event.routingKey)
    await asOrganization(tx, space.organizationId)
    await deleteSpace(tx, space)
  }

  return new Map([
    ['twake.space.created', onCreated],
    ['twake.space.updated', onUpdated],
    ['twake.space.deleted', onDeleted],
    ['twake.space.member.added', onMembersChanged],
    ['twake.space.member.role.changed', onMembersChanged],
    ['twake.space.member.removed', onMembersRemoved]
  ])
}

export const PURGE_SPACE_JOB = 'purge-space'

const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000

const purgePayload = z.object({
  projectId: z.uuid(),
  organizationId: z.string().min(1)
})

// The space's mapping row goes with its project.
export const purgeSpace: JobHandler = async (raw, tx) => {
  const job = purgePayload.parse(raw)
  await asOrganization(tx, job.organizationId)
  await tx
    .delete(projects)
    .where(and(eq(projects.id, job.projectId), isNotNull(projects.deletedAt)))
  return undefined
}
