import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { inject } from 'vitest'
import type { PlatformEvent } from '../../events/envelope.ts'
import { MalformedEventError } from '../../events/router.ts'
import { createDb } from '../../infra/db.ts'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'
import { spaceRoutes, type Publish } from './events.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))
const publish = vi.fn<Publish>().mockResolvedValue()
const routes = spaceRoutes(publish)

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

function deliver(routingKey: string, body: object) {
  const handler = routes.get(routingKey)
  if (!handler) throw new Error(`no handler for ${routingKey}`)
  const event: PlatformEvent = { routingKey, messageId: randomUUID(), body }
  return db.transaction(tx => handler(event, tx))
}

const member = (user: TestUser, role: string) => ({
  uuid: user.userId,
  username: user.email.split('@')[0],
  email: user.email,
  role
})

async function spaceBoards(user: TestUser) {
  return (await api.as(user).get('/boards'))
    .json<{
      boards: {
        name: string
        keyPrefix: string
        spaceId: string
        role: string
      }[]
    }>()
    .boards.filter(board => board.spaceId)
}

describe('twake.space.created', () => {
  it('creates the first board, open to the members with their space role', async () => {
    const admin = aUser()
    const viewer = aUser({ organizationId: admin.organizationId })
    const spaceId = randomUUID()

    await deliver('twake.space.created', {
      organizationId: admin.organizationId,
      id: spaceId,
      name: 'Équipe design',
      members: [member(admin, 'admin'), member(viewer, 'viewer')]
    })

    expect(await spaceBoards(admin)).toEqual([
      expect.objectContaining({
        name: 'Équipe design',
        keyPrefix: 'EQU',
        spaceId,
        role: 'admin'
      })
    ])
    expect(await spaceBoards(viewer)).toEqual([
      expect.objectContaining({ spaceId, role: 'viewer' })
    ])
    expect(
      await spaceBoards(aUser({ organizationId: admin.organizationId }))
    ).toEqual([])
  })

  it('publishes the space as provisioned, and the same event again on replay', async () => {
    const admin = aUser()
    const spaceId = randomUUID()
    const created = {
      organizationId: admin.organizationId,
      id: spaceId,
      name: 'Ops',
      members: [member(admin, 'admin')]
    }
    publish.mockClear()

    await deliver('twake.space.created', created)
    await deliver('twake.space.created', { ...created, name: 'Renamed' })

    expect(await spaceBoards(admin)).toEqual([
      expect.objectContaining({ name: 'Ops' })
    ])
    expect(publish).toHaveBeenCalledTimes(2)
    expect(publish.mock.calls[1]).toEqual(publish.mock.calls[0])
    expect(publish).toHaveBeenCalledWith(
      spaceId,
      expect.objectContaining({
        specversion: '1.0',
        source: 'twake://tasks',
        type: 'com.twake.tasks.space.provisioned.v1',
        twakeorg: admin.organizationId,
        data: { space_id: spaceId, resource: { kind: 'tasks', id: spaceId } }
      })
    )
  })

  it('falls back to a generic key prefix for a name without latin letters', async () => {
    const admin = aUser()

    await deliver('twake.space.created', {
      organizationId: admin.organizationId,
      id: randomUUID(),
      name: 'Команда',
      members: [member(admin, 'admin')]
    })

    expect(await spaceBoards(admin)).toEqual([
      expect.objectContaining({ keyPrefix: 'TASK' })
    ])
  })

  it('drops an event without a space id', async () => {
    await expect(
      deliver('twake.space.created', { organizationId: 'org', name: 'Ops' })
    ).rejects.toThrow(MalformedEventError)
  })
})

describe('space members and name', () => {
  it('follows added members, role changes and renames', async () => {
    const admin = aUser()
    const newcomer = aUser({ organizationId: admin.organizationId })
    const spaceId = randomUUID()
    const space = { organizationId: admin.organizationId, id: spaceId }
    await deliver('twake.space.created', {
      ...space,
      name: 'Ops',
      members: [member(admin, 'admin')]
    })

    await deliver('twake.space.member.added', {
      ...space,
      members: [member(newcomer, 'viewer')]
    })
    expect(await spaceBoards(newcomer)).toEqual([
      expect.objectContaining({ role: 'viewer' })
    ])

    await deliver('twake.space.member.role.changed', {
      ...space,
      members: [member(newcomer, 'editor')]
    })
    expect(await spaceBoards(newcomer)).toEqual([
      expect.objectContaining({ role: 'editor' })
    ])

    await deliver('twake.space.updated', { ...space, name: 'Operations' })
    expect(
      (await api.as(admin).get('/spaces')).json<{
        spaces: { name: string }[]
      }>().spaces
    ).toEqual([expect.objectContaining({ name: 'Operations' })])
  })
})
