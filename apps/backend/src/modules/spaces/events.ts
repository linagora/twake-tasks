import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { OutgoingEvent, PlatformEvent } from '../../events/envelope.ts'
import { parseOrDrop, type Handler } from '../../events/router.ts'
import { asOrganization, type Tx } from '../../infra/db.ts'
import { boards } from '../boards/schema.ts'
import { addDefaultSections } from '../boards/store.ts'
import { memberRole, spaceMembers, spaces } from './schema.ts'

export type Publish = (key: string, event: OutgoingEvent) => Promise<void>

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

export function spaceRoutes(
  publish: Publish
): ReadonlyMap<string, Handler<PlatformEvent>> {
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
    await publish(space.id, provisioned(space))
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

  return new Map([
    ['twake.space.created', onCreated],
    ['twake.space.updated', onUpdated],
    ['twake.space.member.added', onMembersChanged],
    ['twake.space.member.role.changed', onMembersChanged]
  ])
}
