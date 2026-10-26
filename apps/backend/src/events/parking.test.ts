import { randomUUID } from 'node:crypto'
import { eq, sql as raw } from 'drizzle-orm'
import { pino } from 'pino'
import { afterAll, describe, expect, inject, it, vi } from 'vitest'
import { asOrganization, createDb } from '../infra/db.ts'
import { createMetrics } from '../infra/metrics.ts'
import type { Delivery } from '../infra/rabbitmq.ts'
import { projectMembers } from '../modules/boards/schema.ts'
import { spaceRoutes } from '../modules/spaces/events.ts'
import { postgresDeduplicator } from './dedupe.ts'
import { parkedRetries, parkIn, type DeadLetter } from './parking.ts'
import { createMessageHandler, type Outcome } from './router.ts'
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

type Handle = (delivery: Delivery) => Promise<Outcome>

function retries(
  deadLetter: DeadLetter = vi.fn<DeadLetter>(),
  retried: Handle = handle
) {
  return parkedRetries({ db, logger, handle: retried, deadLetter })
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

async function create(space: ReturnType<typeof aSpace>, admin: string) {
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
}

const parked = (delivery: Delivery) =>
  db
    .select()
    .from(parkedEvents)
    .where(eq(parkedEvents.messageId, delivery.messageId ?? ''))

const expire = (delivery: Delivery) =>
  db
    .update(parkedEvents)
    .set({ parkedAt: raw`now() - interval '31 minutes'` })
    .where(eq(parkedEvents.messageId, delivery.messageId ?? ''))

const due = (delivery: Delivery) =>
  db
    .update(parkedEvents)
    .set({ retryAt: raw`now()` })
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
    const retried = vi.fn<Handle>(handle)

    expect(await handle(added)).toBe('parked')
    await retries(undefined, retried).retryOnce()
    expect(retried).not.toHaveBeenCalled()
    expect(await parked(added)).toHaveLength(1)

    await create(space, admin)
    await retries(undefined, retried).retryOnce()

    expect(retried).toHaveBeenCalledOnce()
    expect(await parked(added)).toEqual([])
    expect(await membersOf(space)).toEqual([admin, late].sort())
  })

  it('are retried once each when replicas retry at the same time', async () => {
    const space = aSpace()
    const added = [randomUUID(), randomUUID(), randomUUID()].map(user =>
      memberAdded(space, user)
    )
    for (const event of added) await handle(event)
    await create(space, randomUUID())
    const retried = vi.fn<Handle>(handle)

    await Promise.all([
      retries(undefined, retried).retryOnce(),
      retries(undefined, retried).retryOnce()
    ])

    expect(retried).toHaveBeenCalledTimes(3)
  })

  it('go to the dead letter queue once they waited 30 minutes', async () => {
    const added = memberAdded(aSpace(), randomUUID())
    await handle(added)
    await expire(added)
    const deadLetter = vi.fn<DeadLetter>().mockResolvedValue()

    await retries(deadLetter).retryOnce()

    expect(deadLetter).toHaveBeenCalledWith(
      added,
      expect.stringContaining('not known yet')
    )
    expect(await parked(added)).toEqual([])
  })

  it('go to the dead letter queue once they waited 30 minutes, even when their retry fails', async () => {
    const added = memberAdded(aSpace(), randomUUID())
    await handle(added)
    await expire(added)
    const deadLetter = vi.fn<DeadLetter>().mockResolvedValue()
    const failing = vi.fn<Handle>().mockRejectedValue(new Error('db down'))

    await retries(deadLetter, failing).retryOnce()

    expect(deadLetter).toHaveBeenCalledWith(added, 'db down')
    expect(await parked(added)).toEqual([])
  })

  it('stay parked for a later pass when their retry fails early', async () => {
    const space = aSpace()
    const added = memberAdded(space, randomUUID())
    await handle(added)
    await create(space, randomUUID())
    const deadLetter = vi.fn<DeadLetter>()
    const failing = vi.fn<Handle>().mockRejectedValue(new Error('db down'))

    await retries(deadLetter, failing).retryOnce()
    await retries(deadLetter, failing).retryOnce()

    expect(failing).toHaveBeenCalledOnce()
    expect(deadLetter).not.toHaveBeenCalled()
    expect(await parked(added)).toHaveLength(1)
  })

  it('go to the dead letter queue at once when rejected', async () => {
    const space = aSpace()
    const added = memberAdded(space, randomUUID())
    await handle(added)
    await create(space, randomUUID())
    const deadLetter = vi.fn<DeadLetter>().mockResolvedValue()
    const rejecting = vi.fn<Handle>().mockResolvedValue('rejected')

    await retries(deadLetter, rejecting).retryOnce()

    expect(deadLetter).toHaveBeenCalledWith(added, 'rejected')
    expect(await parked(added)).toEqual([])
  })

  it('stay parked while their dead letter cannot be sent', async () => {
    const added = memberAdded(aSpace(), randomUUID())
    await handle(added)
    await expire(added)
    const deadLetter = vi
      .fn<DeadLetter>()
      .mockRejectedValueOnce(new Error('unroutable'))
      .mockResolvedValue()

    await retries(deadLetter).retryOnce()
    expect(await parked(added)).toHaveLength(1)

    await due(added)
    await retries(deadLetter).retryOnce()
    expect(await parked(added)).toEqual([])
  })

  it('are counted on each pass', async () => {
    await handle(memberAdded(aSpace(), randomUUID()))
    const metrics = createMetrics()

    await parkedRetries({
      db,
      logger,
      handle,
      deadLetter: vi.fn<DeadLetter>(),
      metrics
    }).retryOnce()

    expect(await metrics.registry.metrics()).toMatch(/^events_parked [1-9]/m)
  })
})
