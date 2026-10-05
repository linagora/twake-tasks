import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { OutgoingEvent, PlatformEvent } from '../../events/envelope.ts'
import { enqueue } from '../../events/outbox.ts'
import { parseOrDrop, type Handler } from '../../events/router.ts'
import { asOrganization, type Tx } from '../../infra/db.ts'
import {
  schedule,
  type Handler as JobHandler
} from '../../scheduler/scheduler.ts'
import { boards, taskAssignees, tasks } from '../boards/schema.ts'
import { addDefaultSections } from '../boards/store.ts'
import { memberRole, spaceMembers, spaces } from './schema.ts'

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

async function upsertMembers(
  tx: Tx,
  space: z.infer<typeof spaceEvent>,
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
                spaceId: space.id,
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
    .insert(spaceMembers)
    .values([...byUser.values()])
    .onConflictDoUpdate({
      target: [spaceMembers.spaceId, spaceMembers.userId],
      set: { email: sql`excluded.email`, role: sql`excluded.role` }
    })
}

function provisioned(space: z.infer<typeof spaceEvent>): OutgoingEvent {
  return {
    specversion: '1.0',
    id: `tasks-space-provisioned-${space.id}`,
    source: 'twake://tasks',
    type: 'com.twake.tasks.space.provisioned.v1',
    twakeorg: space.organizationId,
    data: { space_id: space.id, resource: { kind: 'tasks', id: space.id } }
  }
}

export function spaceRoutes(): ReadonlyMap<string, Handler<PlatformEvent>> {
  // A replay finds the space already has a board, creates nothing, and publishes
  // the same event again.
  const onCreated: Handler<PlatformEvent> = async (event, tx) => {
    const space = parseOrDrop(spaceCreated, event.body, event.routingKey)
    await asOrganization(tx, space.organizationId)
    const [created] = await tx
      .insert(spaces)
      .values({
        id: space.id,
        organizationId: space.organizationId,
        name: space.name
      })
      .onConflictDoNothing()
      .returning({ id: spaces.id })
    await upsertMembers(tx, space, space.members)
    if (created) {
      const [board] = await tx
        .insert(boards)
        .values({
          organizationId: space.organizationId,
          spaceId: space.id,
          name: space.name,
          keyPrefix: keyPrefixOf(space.name),
          createdBy: space.id
        })
        .returning({ id: boards.id, organizationId: boards.organizationId })
      if (!board) throw new Error('board insert returned nothing')
      await addDefaultSections(tx, board)
    }
    await enqueue(tx, space.id, provisioned(space))
  }

  const onUpdated: Handler<PlatformEvent> = async (event, tx) => {
    const space = parseOrDrop(spaceUpdated, event.body, event.routingKey)
    if (space.name === undefined) return
    await asOrganization(tx, space.organizationId)
    await tx
      .update(spaces)
      .set({ name: space.name })
      .where(eq(spaces.id, space.id))
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
    const removed = await tx
      .delete(spaceMembers)
      .where(
        and(
          eq(spaceMembers.spaceId, space.id),
          or(
            inArray(spaceMembers.userId, uuids),
            inArray(spaceMembers.email, emails)
          )
        )
      )
      .returning({ userId: spaceMembers.userId })
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
            .where(eq(boards.spaceId, space.id))
        )
      )
    )
  }

  const onDeleted: Handler<PlatformEvent> = async (event, tx) => {
    const space = parseOrDrop(spaceEvent, event.body, event.routingKey)
    await asOrganization(tx, space.organizationId)
    const [deleted] = await tx
      .update(spaces)
      .set({ deletedAt: sql`now()` })
      .where(and(eq(spaces.id, space.id), isNull(spaces.deletedAt)))
      .returning({ id: spaces.id })
    if (!deleted) return
    await schedule(tx, {
      kind: PURGE_SPACE_JOB,
      key: `${PURGE_SPACE_JOB}:${space.id}`,
      payload: { spaceId: space.id, organizationId: space.organizationId },
      runAt: new Date(Date.now() + PURGE_AFTER_MS)
    })
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
  spaceId: z.uuid(),
  organizationId: z.string().min(1)
})

export const purgeSpace: JobHandler = async (raw, tx) => {
  const job = purgePayload.parse(raw)
  await asOrganization(tx, job.organizationId)
  await tx.delete(boards).where(eq(boards.spaceId, job.spaceId))
  await tx
    .delete(spaces)
    .where(and(eq(spaces.id, job.spaceId), isNotNull(spaces.deletedAt)))
  return undefined
}
