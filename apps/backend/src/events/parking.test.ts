import { randomUUID } from 'node:crypto'
import { eq, sql as raw } from 'drizzle-orm'
import { pino } from 'pino'
import { afterAll, describe, expect, inject, it, vi } from 'vitest'
import { asOrganization, createDb } from '../infra/db.ts'
import type { Delivery } from '../infra/rabbitmq.ts'
import { projectMembers } from '../modules/boards/schema.ts'
import { spaceRoutes } from '../modules/spaces/events.ts'
import { postgresDeduplicator } from './dedupe.ts'
import { parkedRetries, parkIn, type DeadLetter } from './parking.ts'
import { createMessageHandler } from './router.ts'
import { parkedEvents } from './schema.ts'

// Only this file parks events, so its retry passes see no one else's.
const { sql, db } = createDb(inject('databaseUrl'))
const logger = pino({ level: 'silent' })

afterAll(async () => {
  await sql.end()
})

const handle = createMessageHandler({
  routes: spaceRoutes(),
  dedupe: postgresDeduplicator(db, 'parking-test'),
  park: parkIn(db),
  logger
})

function retries(deadLetter: DeadLetter = vi.fn<DeadLetter>()) {
  return parkedRetries({ db, logger, handle, deadLetter })
}

function aSpace() {
  return { organizationId: `org-${randomUUID()}`, id: randomUUID() }
}

const memberAdded = (space: ReturnType<typeof aSpace>, userId: string) => ({
  exchange: 'space',
  routingKey: 'twake.space.member.added',
  messageId: randomUUID(),
  body: {
    ...space,
    timestamp: new Date().toISOString(),
    members: [{ uuid: userId, email: `${userId}@example.com`, role: 'editor' }]
  }
})

const parked = (delivery: Delivery) =>
  db
    .select()
    .from(parkedEvents)
    .where(eq(parkedEvents.messageId, delivery.messageId ?? ''))

async function membersOf(space: ReturnType<typeof aSpace>) {
  return db.transaction(async tx => {
    await asOrganization(tx, space.organizationId)
    const rows = await tx
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
    return rows.map(row => row.userId).sort()
  })
}

describe('parked events', () => {
  it('wait for their space, then apply once it is created', async () => {
    const space = aSpace()
    const admin = randomUUID()
    const late = randomUUID()
    const added = memberAdded(space, late)

    expect(await handle(added)).toBe('parked')
    await retries().retryOnce()
    expect(await parked(added)).toHaveLength(1)

    await handle({
      exchange: 'space',
      routingKey: 'twake.space.created',
      messageId: randomUUID(),
      body: {
        ...space,
        name: 'Ops',
        timestamp: new Date(Date.now() - 60_000).toISOString(),
        members: [{ uuid: admin, email: `${admin}@example.com`, role: 'admin' }]
      }
    })
    await retries().retryOnce()

    expect(await parked(added)).toEqual([])
    expect(await membersOf(space)).toEqual([admin, late].sort())
  })

  it('go to the dead letter queue once they waited 30 minutes', async () => {
    const added = memberAdded(aSpace(), randomUUID())
    await handle(added)
    await db
      .update(parkedEvents)
      .set({ parkedAt: raw`now() - interval '31 minutes'` })
      .where(eq(parkedEvents.messageId, added.messageId))
    const deadLetter = vi.fn<DeadLetter>().mockResolvedValue()

    await retries(deadLetter).retryOnce()

    expect(deadLetter).toHaveBeenCalledWith(
      added,
      expect.stringContaining('not known yet')
    )
    expect(await parked(added)).toEqual([])
  })

  it('stay parked while their dead letter cannot be sent', async () => {
    const added = memberAdded(aSpace(), randomUUID())
    await handle(added)
    await db
      .update(parkedEvents)
      .set({ parkedAt: raw`now() - interval '31 minutes'` })
      .where(eq(parkedEvents.messageId, added.messageId))
    const deadLetter = vi
      .fn<DeadLetter>()
      .mockRejectedValueOnce(new Error('unroutable'))
      .mockResolvedValue()

    await retries(deadLetter).retryOnce()
    expect(await parked(added)).toHaveLength(1)

    await retries(deadLetter).retryOnce()
    expect(await parked(added)).toEqual([])
  })
})
