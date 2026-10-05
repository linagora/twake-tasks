import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { inject } from 'vitest'
import type { PlatformEvent } from '../../events/envelope.ts'
import { MalformedEventError } from '../../events/router.ts'
import { eq } from 'drizzle-orm'
import { asOrganization, createDb } from '../../infra/db.ts'
import { boards } from '../boards/schema.ts'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'
import { jobs } from '../../scheduler/schema.ts'
import {
  PURGE_SPACE_JOB,
  purgeSpace,
  spaceRoutes,
  type Publish
} from './events.ts'

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
        id: string
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

async function aSpaceWithATask(admin: TestUser, members: TestUser[]) {
  if (!admin.organizationId) throw new Error('spaces are B2B')
  const space = { organizationId: admin.organizationId, id: randomUUID() }
  await deliver('twake.space.created', {
    ...space,
    name: 'Ops',
    members: [
      member(admin, 'admin'),
      ...members.map(user => member(user, 'editor'))
    ]
  })
  const [board] = await spaceBoards(admin)
  if (!board) throw new Error('no space board')
  const task = (
    await api
      .as(admin)
      .post(`/boards/${board.id}/tasks`, { sectionId: null, title: 'Logo' })
  ).json<{ id: string }>()
  await api.as(admin).put(`/boards/${board.id}/tasks/${task.id}/assignees`, {
    userIds: [admin.userId, ...members.map(user => user.userId)]
  })
  const assignees = async () =>
    (await api.as(admin).get(`/boards/${board.id}`))
      .json<{ tasks: { assignees: { userId: string }[] }[] }>()
      .tasks[0]?.assignees.map(person => person.userId)
  return { space, boardId: board.id, assignees }
}

describe('twake.space.member.removed', () => {
  it('takes the board away and unassigns, matching by uuid or by email', async () => {
    const admin = aUser()
    const byUuid = aUser({ organizationId: admin.organizationId })
    const byEmail = aUser({ organizationId: admin.organizationId })
    const { space, assignees } = await aSpaceWithATask(admin, [byUuid, byEmail])

    await deliver('twake.space.member.removed', {
      ...space,
      members: [{ uuid: byUuid.userId }, { email: byEmail.email }]
    })

    expect(await spaceBoards(byUuid)).toEqual([])
    expect(await spaceBoards(byEmail)).toEqual([])
    expect(await assignees()).toEqual([admin.userId])
  })
})

describe('twake.space.deleted', () => {
  it('hides the boards, then purges them after 30 days', async () => {
    const admin = aUser()
    const { space, boardId } = await aSpaceWithATask(admin, [])

    await deliver('twake.space.deleted', space)

    expect(await spaceBoards(admin)).toEqual([])
    expect((await api.as(admin).get(`/boards/${boardId}`)).statusCode).toBe(404)
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.key, `${PURGE_SPACE_JOB}:${space.id}`))
    if (!job) throw new Error('no purge job')
    const days = (job.runAt.getTime() - Date.now()) / 86_400_000
    expect(Math.round(days)).toBe(30)

    await db.transaction(tx => purgeSpace(job.payload, tx))

    const remaining = await db.transaction(async tx => {
      await asOrganization(tx, space.organizationId)
      return tx.select().from(boards).where(eq(boards.spaceId, space.id))
    })
    expect(remaining).toEqual([])
  })
})
