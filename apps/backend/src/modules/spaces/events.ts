import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  notInArray,
  or,
  sql,
  type SQL
} from 'drizzle-orm'
import { z } from 'zod'
import type { OutgoingEvent, PlatformEvent } from '../../events/envelope.ts'
import { enqueue } from '../../events/outbox.ts'
import {
  NotYetKnownError,
  parseOrDrop,
  type Handler
} from '../../events/router.ts'
import { asOrganization, type Db, type Tx } from '../../infra/db.ts'
import {
  schedule,
  type Handler as JobHandler
} from '../../scheduler/scheduler.ts'
import { unfollowProject } from '../boards/followers.ts'
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

const MAX_CLOCK_AHEAD_MS = 24 * 60 * 60 * 1000

// An event dated far ahead would mark every later event of its space stale.
const timestamp = z.iso
  .datetime({ offset: true })
  .refine(
    at => Date.parse(at) <= Date.now() + MAX_CLOCK_AHEAD_MS,
    'dated in the future'
  )

const spaceEvent = z.looseObject({
  organizationId: z.string().min(1),
  id: z.uuid(),
  timestamp
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

const syncCompleted = z.looseObject({
  organizationId: z.string().min(1),
  spaceIds: z.array(z.uuid()),
  timestamp
})

const FALLBACK_KEY_PREFIX = 'TASK'

function keyPrefixOf(name: string) {
  const letters = name
    .normalize('NFD')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^[0-9]+/, '')
  return letters.slice(0, 3) || FALLBACK_KEY_PREFIX
}

type SpaceRef = Pick<z.infer<typeof spaceEvent>, 'organizationId' | 'id'>
type TimedSpace = SpaceRef & { timestamp: string }

// A late or redelivered event must not undo a newer one; equal timestamps
// apply in the order they arrive.
async function isStale(tx: Tx, space: TimedSpace): Promise<boolean> {
  const [row] = await tx
    .select({
      stale: sql<boolean>`${spaces.lastEventAt} > ${space.timestamp}::timestamptz`
    })
    .from(spaces)
    .where(eq(spaces.id, space.id))
  return row?.stale === true
}

async function applied(tx: Tx, space: TimedSpace) {
  await tx
    .update(spaces)
    .set({
      lastEventAt: sql`greatest(${spaces.lastEventAt}, ${space.timestamp}::timestamptz)`
    })
    .where(eq(spaces.id, space.id))
}

/** Whether any organization has a space, deleted or not. */
export async function knowsAnySpace(db: Db): Promise<boolean> {
  return db.transaction(async tx => {
    await tx.execute(sql`select set_config('app.space_lookup', 'on', true)`)
    const [row] = await tx.select({ id: spaces.id }).from(spaces).limit(1)
    return row !== undefined
  })
}

interface LockedSpace {
  projectId: string
  deleted: boolean
}

// Held until the transaction ends, so two events of a space never interleave
// while other spaces go on. A space still being inserted by another
// transaction is not seen. The space's row is locked before its project's, in
// every handler, so none waits on another in a cycle; the project is read once
// locked, so its deletion is never a stale snapshot.
async function lockSpace(
  tx: Tx,
  space: SpaceRef
): Promise<LockedSpace | undefined> {
  const [row] = await tx
    .select({ projectId: spaces.projectId })
    .from(spaces)
    .where(eq(spaces.id, space.id))
    .for('update')
  if (!row) return undefined
  const [project] = await tx
    .select({ deletedAt: projects.deletedAt })
    .from(projects)
    .where(eq(projects.id, row.projectId))
    .for('no key update')
  return { projectId: row.projectId, deleted: project?.deletedAt !== null }
}

/** The project kept for the space, deleted or not. */
async function projectOf(tx: Tx, space: SpaceRef): Promise<string | undefined> {
  const [row] = await tx
    .select({ projectId: spaces.projectId })
    .from(spaces)
    .where(eq(spaces.id, space.id))
  return row?.projectId
}

// Names are copied onto memberships at sign-in, so a new membership starts
// from one the person already has.
const knownName = (userId: string) =>
  sql<string | null>`(select ${projectMembers.name} from ${projectMembers}
    where ${projectMembers.userId} = ${userId} and ${projectMembers.name} is not null
    limit 1)`

async function upsertMembers(
  tx: Tx,
  space: SpaceRef,
  projectId: string,
  members: z.infer<typeof member>[]
) {
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
                role,
                name: knownName(uuid)
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

function provisioned(space: SpaceRef, projectId: string): OutgoingEvent {
  return {
    specversion: '1.0',
    id: `tasks-space-provisioned-${space.id}`,
    source: 'twake://tasks',
    type: 'com.twake.tasks.space.provisioned.v1',
    twakeorg: space.organizationId,
    data: { space_id: space.id, resource: { kind: 'project', id: projectId } }
  }
}

async function provisionSpace(
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

async function renameSpace(tx: Tx, projectId: string, name: string) {
  await tx.update(projects).set({ name }).where(eq(projects.id, projectId))
}

/** Takes the space's boards and its tasks away from these people, and stops them following. */
async function removeMembers(
  tx: Tx,
  projectId: string,
  which: SQL | undefined
): Promise<void> {
  const removed = await tx
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), which))
    .returning({ userId: projectMembers.userId })
  if (removed.length === 0) return
  await unfollowProject(
    tx,
    removed.map(m => m.userId),
    projectId
  )
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

async function deleteLocked(tx: Tx, space: SpaceRef, locked: LockedSpace) {
  if (locked.deleted) return
  const { projectId } = locked
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

/** Hides the space's project now, and purges it after 30 days. */
export async function deleteSpace(tx: Tx, space: SpaceRef): Promise<void> {
  const locked = await lockSpace(tx, space)
  if (locked) await deleteLocked(tx, space, locked)
}

type WholeSpace = SpaceRef & { name: string; members: z.infer<typeof member>[] }

// A deleted space stays deleted, since space ids are never reused.
async function matchLocked(tx: Tx, space: WholeSpace, locked: LockedSpace) {
  if (locked.deleted) return
  const { projectId } = locked
  // Every time, so TwakeSpace learns the project even if an earlier event was
  // lost; it ignores the repeats, which share the event id.
  await enqueue(tx, provisioned(space, projectId))
  await renameSpace(tx, projectId, space.name)
  await upsertMembers(tx, space, projectId, space.members)
  const uuids = space.members.flatMap(m => (m.uuid ? [m.uuid] : []))
  await removeMembers(
    tx,
    projectId,
    and(
      notInArray(projectMembers.userId, uuids),
      notInArray(
        projectMembers.email,
        space.members.map(m => m.email)
      )
    )
  )
}

/** Makes the space's project match the whole space, creating it if missing. */
export async function matchSpace(tx: Tx, space: WholeSpace): Promise<void> {
  await provisionSpace(tx, space)
  const locked = await lockSpace(tx, space)
  if (locked) await matchLocked(tx, space, locked)
}

// Only twake.space.created and a sync bring a space.
async function lockKnownSpace(tx: Tx, space: SpaceRef): Promise<LockedSpace> {
  const locked = await lockSpace(tx, space)
  if (!locked) throw new NotYetKnownError(`space ${space.id} not known yet`)
  return locked
}

function inOrder<S extends z.ZodType<TimedSpace>>(
  schema: S,
  apply: (tx: Tx, space: z.output<S>, locked: LockedSpace) => Promise<void>
): Handler<PlatformEvent> {
  return async (event, tx) => {
    const space = parseOrDrop(schema, event.body, event.routingKey)
    await asOrganization(tx, space.organizationId)
    const locked = await lockKnownSpace(tx, space)
    if (await isStale(tx, space)) return
    await apply(tx, space, locked)
    await applied(tx, space)
  }
}

export function spaceRoutes(): ReadonlyMap<string, Handler<PlatformEvent>> {
  // A replay creates nothing, and publishes the same event again. Inserting
  // first makes a concurrent duplicate wait for this one, then lock its row.
  const onCreated: Handler<PlatformEvent> = async (event, tx) => {
    const space = parseOrDrop(spaceCreated, event.body, event.routingKey)
    await asOrganization(tx, space.organizationId)
    await provisionSpace(tx, space)
    const locked = await lockKnownSpace(tx, space)
    if (!(await isStale(tx, space))) {
      if (!locked.deleted) {
        await upsertMembers(tx, space, locked.projectId, space.members)
      }
      await applied(tx, space)
    }
    await enqueue(tx, provisioned(space, locked.projectId))
  }

  const onUpdated = inOrder(spaceUpdated, async (tx, space, locked) => {
    if (space.name !== undefined) {
      await renameSpace(tx, locked.projectId, space.name)
    }
  })

  // A deleted space stays without members, whatever arrives after.
  const onMembersChanged = inOrder(
    membersChanged,
    async (tx, space, locked) => {
      if (!locked.deleted) {
        await upsertMembers(tx, space, locked.projectId, space.members)
      }
    }
  )

  const onMembersRemoved = inOrder(
    membersRemoved,
    async (tx, space, locked) => {
      if (locked.deleted) return
      const uuids = space.members.flatMap(p => (p.uuid ? [p.uuid] : []))
      const emails = space.members.flatMap(p => (p.email ? [p.email] : []))
      await removeMembers(
        tx,
        locked.projectId,
        or(
          inArray(projectMembers.userId, uuids),
          inArray(projectMembers.email, emails)
        )
      )
    }
  )

  const onSynced: Handler<PlatformEvent> = async (event, tx) => {
    const space = parseOrDrop(spaceCreated, event.body, event.routingKey)
    await asOrganization(tx, space.organizationId)
    await provisionSpace(tx, space)
    const locked = await lockKnownSpace(tx, space)
    if (await isStale(tx, space)) return
    await matchLocked(tx, space, locked)
    await applied(tx, space)
  }

  // Applied whatever its timestamp, since a space id is never reused.
  const onDeleted: Handler<PlatformEvent> = async (event, tx) => {
    const space = parseOrDrop(spaceEvent, event.body, event.routingKey)
    await asOrganization(tx, space.organizationId)
    await deleteLocked(tx, space, await lockKnownSpace(tx, space))
    await applied(tx, space)
  }

  // A space with an event newer than the snapshot may be missing from it.
  const onSyncCompleted: Handler<PlatformEvent> = async (event, tx) => {
    const sync = parseOrDrop(syncCompleted, event.body, event.routingKey)
    await asOrganization(tx, sync.organizationId)
    const gone = await tx
      .select({ id: spaces.id })
      .from(spaces)
      .innerJoin(projects, eq(projects.id, spaces.projectId))
      .where(
        and(
          eq(spaces.organizationId, sync.organizationId),
          isNull(projects.deletedAt),
          notInArray(spaces.id, sync.spaceIds),
          or(
            isNull(spaces.lastEventAt),
            lte(spaces.lastEventAt, sql`${sync.timestamp}::timestamptz`)
          )
        )
      )
      // In one order, so two of these cannot deadlock.
      .orderBy(spaces.id)
      .for('update', { of: spaces })
    for (const { id } of gone) {
      await deleteSpace(tx, { organizationId: sync.organizationId, id })
    }
  }

  return new Map([
    ['twake.space.created', onCreated],
    ['twake.space.updated', onUpdated],
    ['twake.space.deleted', onDeleted],
    ['twake.space.member.added', onMembersChanged],
    ['twake.space.member.role.changed', onMembersChanged],
    ['twake.space.member.removed', onMembersRemoved],
    ['twake.space.synced', onSynced],
    ['twake.space.sync.completed', onSyncCompleted]
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
