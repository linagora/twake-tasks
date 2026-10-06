import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inject } from 'vitest'
import type { PlatformEvent } from '../../events/envelope.ts'
import { MalformedEventError } from '../../events/router.ts'
import { eq, sql as raw } from 'drizzle-orm'
import { asOrganization, createDb } from '../../infra/db.ts'
import { boards } from '../boards/schema.ts'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'
import { jobs } from '../../scheduler/schema.ts'
import { outbox } from '../../events/schema.ts'
import {
  knowsAnySpace,
  PURGE_SPACE_JOB,
  purgeSpace,
  spaceRoutes
} from './events.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))
const routes = spaceRoutes()

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
  const event: PlatformEvent = {
    routingKey,
    messageId: randomUUID(),
    body: { timestamp: new Date().toISOString(), ...body }
  }
  return db.transaction(tx => handler(event, tx))
}

const at = (minute: number) =>
  new Date(Date.UTC(2026, 9, 6, 9, minute)).toISOString()

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
        project: { id: string; name: string; managed: boolean }
        role: string
      }[]
    }>()
    .boards.filter(board => board.project.managed)
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
        project: expect.objectContaining({ name: 'Équipe design' }) as object,
        role: 'admin'
      })
    ])
    expect(await spaceBoards(viewer)).toEqual([
      expect.objectContaining({ name: 'Équipe design', role: 'viewer' })
    ])
    expect(
      await spaceBoards(aUser({ organizationId: admin.organizationId }))
    ).toEqual([])
  })

  it('publishes the space project as provisioned, and the same event again on replay', async () => {
    const admin = aUser()
    const spaceId = randomUUID()
    const created = {
      organizationId: admin.organizationId,
      id: spaceId,
      name: 'Ops',
      members: [member(admin, 'admin')]
    }

    await deliver('twake.space.created', created)
    await deliver('twake.space.created', { ...created, name: 'Renamed' })

    const boards = await spaceBoards(admin)
    expect(boards).toEqual([expect.objectContaining({ name: 'Ops' })])
    const queued = await db
      .select({ event: outbox.event })
      .from(outbox)
      .where(raw`${outbox.event} -> 'data' ->> 'space_id' = ${spaceId}`)
    expect(queued).toHaveLength(2)
    expect(queued[1]).toEqual(queued[0])
    expect(queued[0]).toMatchObject({
      event: {
        specversion: '1.0',
        source: 'twake://tasks',
        type: 'com.twake.tasks.space.provisioned.v1',
        twakeorg: admin.organizationId,
        data: {
          space_id: spaceId,
          resource: { kind: 'project', id: boards[0]?.project.id }
        }
      }
    })
  })

  it('gives two spaces of an organization the same key prefix when their names start alike', async () => {
    const admin = aUser()

    for (const name of ['Roadmap 2026', 'Roadmap 2027']) {
      await deliver('twake.space.created', {
        organizationId: admin.organizationId,
        id: randomUUID(),
        name,
        members: [member(admin, 'admin')]
      })
    }

    expect(await spaceBoards(admin)).toEqual([
      expect.objectContaining({ keyPrefix: 'ROA' }),
      expect.objectContaining({ keyPrefix: 'ROA' })
    ])
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
      (await api.as(admin).get('/projects')).json<{
        projects: { name: string; managed: boolean }[]
      }>().projects
    ).toEqual([expect.objectContaining({ name: 'Operations', managed: true })])
  })

  it('shows a member added to a space by the name they already signed in with', async () => {
    const admin = aUser()
    const newcomer = aUser({ organizationId: admin.organizationId })
    await api.as({ ...newcomer, name: 'Nina Dupont' }).get('/boards')
    const space = { organizationId: admin.organizationId, id: randomUUID() }
    await deliver('twake.space.created', {
      ...space,
      name: 'Ops',
      members: [member(admin, 'admin')]
    })

    await deliver('twake.space.member.added', {
      ...space,
      members: [member(newcomer, 'editor')]
    })

    const [board] = await spaceBoards(admin)
    const members = (
      await api.as(admin).get(`/boards/${board?.id ?? ''}`)
    ).json<{
      members: { userId: string; name: string | null }[]
    }>().members
    expect(members).toContainEqual(
      expect.objectContaining({ userId: newcomer.userId, name: 'Nina Dupont' })
    )
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
      return tx.select().from(boards).where(eq(boards.id, boardId))
    })
    expect(remaining).toEqual([])
  })

  it('applies even when older than the last event of the space', async () => {
    const admin = aUser()
    const { space } = await aSpaceWithATask(admin, [])
    await deliver('twake.space.updated', {
      ...space,
      name: 'Renamed',
      timestamp: at(30)
    })

    await deliver('twake.space.deleted', { ...space, timestamp: at(10) })

    expect(await spaceBoards(admin)).toEqual([])
  })
})

describe('the order of space events', () => {
  it('ignores an event older than the last one applied to its space', async () => {
    const admin = aUser()
    const other = aUser({ organizationId: admin.organizationId })
    const space = { organizationId: admin.organizationId, id: randomUUID() }
    await deliver('twake.space.created', {
      ...space,
      name: 'Ops',
      members: [member(admin, 'admin')],
      timestamp: at(0)
    })
    await deliver('twake.space.member.added', {
      ...space,
      members: [member(other, 'editor')],
      timestamp: at(20)
    })

    await deliver('twake.space.member.removed', {
      ...space,
      members: [{ uuid: other.userId }],
      timestamp: at(10)
    })
    await deliver('twake.space.updated', {
      ...space,
      name: 'Stale',
      timestamp: at(15)
    })

    expect(await spaceBoards(other)).toEqual([
      expect.objectContaining({ role: 'editor' })
    ])
    expect(await spaceBoards(admin)).toEqual([
      expect.objectContaining({
        project: expect.objectContaining({ name: 'Ops' }) as object
      })
    ])
  })

  it('applies events with the same timestamp in the order they arrive', async () => {
    const admin = aUser()
    const other = aUser({ organizationId: admin.organizationId })
    const space = { organizationId: admin.organizationId, id: randomUUID() }
    await deliver('twake.space.created', {
      ...space,
      name: 'Ops',
      members: [member(admin, 'admin')],
      timestamp: at(0)
    })

    await deliver('twake.space.member.added', {
      ...space,
      members: [member(other, 'viewer')],
      timestamp: at(5)
    })
    await deliver('twake.space.member.role.changed', {
      ...space,
      members: [member(other, 'editor')],
      timestamp: at(5)
    })

    expect(await spaceBoards(other)).toEqual([
      expect.objectContaining({ role: 'editor' })
    ])
  })

  it('publishes the project again on a late twake.space.created', async () => {
    const admin = aUser()
    const space = { organizationId: admin.organizationId, id: randomUUID() }
    const created = {
      ...space,
      name: 'Ops',
      members: [member(admin, 'admin')],
      timestamp: at(0)
    }
    await deliver('twake.space.created', created)
    await deliver('twake.space.member.role.changed', {
      ...space,
      members: [member(admin, 'viewer')],
      timestamp: at(10)
    })

    await deliver('twake.space.created', created)

    expect(await spaceBoards(admin)).toEqual([
      expect.objectContaining({ role: 'viewer' })
    ])
    const queued = await db
      .select({ event: outbox.event })
      .from(outbox)
      .where(raw`${outbox.event} -> 'data' ->> 'space_id' = ${space.id}`)
    expect(queued).toHaveLength(2)
  })

  it('drops a space event without a timestamp', async () => {
    const handler = routes.get('twake.space.updated')
    const event: PlatformEvent = {
      routingKey: 'twake.space.updated',
      messageId: randomUUID(),
      body: { organizationId: 'org', id: randomUUID(), name: 'Ops' }
    }

    await expect(
      db.transaction(tx => handler?.(event, tx) ?? Promise.resolve())
    ).rejects.toThrow(MalformedEventError)
  })
})

describe('twake.space.synced', () => {
  it('creates a space it never heard of, with its members, and publishes its project', async () => {
    const admin = aUser()
    const viewer = aUser({ organizationId: admin.organizationId })
    const space = { organizationId: admin.organizationId, id: randomUUID() }

    await deliver('twake.space.synced', {
      ...space,
      name: 'Roadmap',
      members: [member(admin, 'admin'), member(viewer, 'viewer')],
      groups: []
    })

    const boards = await spaceBoards(admin)
    expect(boards).toEqual([
      expect.objectContaining({ name: 'Roadmap', role: 'admin' })
    ])
    expect(await spaceBoards(viewer)).toEqual([
      expect.objectContaining({ role: 'viewer' })
    ])
    const queued = await db
      .select({ event: outbox.event })
      .from(outbox)
      .where(raw`${outbox.event} -> 'data' ->> 'space_id' = ${space.id}`)
    expect(queued).toEqual([
      expect.objectContaining({
        event: expect.objectContaining({
          data: {
            space_id: space.id,
            resource: { kind: 'project', id: boards[0]?.project.id }
          }
        }) as object
      })
    ])
  })

  it('makes the project match the space: name, roles, and who left', async () => {
    const admin = aUser()
    const leaver = aUser({ organizationId: admin.organizationId })
    const promoted = aUser({ organizationId: admin.organizationId })
    const joiner = aUser({ organizationId: admin.organizationId })
    const { space, assignees } = await aSpaceWithATask(admin, [
      leaver,
      promoted
    ])

    await deliver('twake.space.synced', {
      ...space,
      name: 'Operations',
      members: [
        member(admin, 'admin'),
        member(promoted, 'admin'),
        member(joiner, 'viewer')
      ],
      groups: []
    })

    expect(await spaceBoards(leaver)).toEqual([])
    expect(await spaceBoards(promoted)).toEqual([
      expect.objectContaining({ role: 'admin' })
    ])
    expect(await spaceBoards(joiner)).toEqual([
      expect.objectContaining({ role: 'viewer' })
    ])
    expect(await assignees()).toEqual(
      expect.arrayContaining([admin.userId, promoted.userId])
    )
    expect(await assignees()).not.toContain(leaver.userId)
    expect(await spaceBoards(admin)).toEqual([
      expect.objectContaining({
        project: expect.objectContaining({ name: 'Operations' }) as object
      })
    ])
  })

  it('ignores a snapshot older than the last event of the space', async () => {
    const admin = aUser()
    const space = { organizationId: admin.organizationId, id: randomUUID() }
    await deliver('twake.space.created', {
      ...space,
      name: 'Ops',
      members: [member(admin, 'admin')],
      timestamp: at(30)
    })

    await deliver('twake.space.synced', {
      ...space,
      name: 'Stale',
      members: [],
      groups: [],
      timestamp: at(10)
    })

    expect(await spaceBoards(admin)).toEqual([
      expect.objectContaining({ role: 'admin' })
    ])
  })

  it('leaves a deleted space deleted', async () => {
    const admin = aUser()
    const { space } = await aSpaceWithATask(admin, [])
    await deliver('twake.space.deleted', { ...space, timestamp: at(0) })

    await deliver('twake.space.synced', {
      ...space,
      name: 'Ops',
      members: [member(admin, 'admin')],
      groups: []
    })

    expect(await spaceBoards(admin)).toEqual([])
  })
})

describe('twake.space.sync.completed', () => {
  it('deletes the spaces of the organization it does not list, except newer ones', async () => {
    const listedAdmin = aUser()
    const goneAdmin = aUser({ organizationId: listedAdmin.organizationId })
    const newerAdmin = aUser({ organizationId: listedAdmin.organizationId })
    const elsewhere = aUser()
    const listed = await aSpaceWithATask(listedAdmin, [])
    const gone = await aSpaceWithATask(goneAdmin, [])
    const newer = await aSpaceWithATask(newerAdmin, [])
    await aSpaceWithATask(elsewhere, [])
    await deliver('twake.space.updated', {
      ...newer.space,
      name: 'Newer',
      timestamp: '2999-01-01T00:00:00.000Z'
    })

    await deliver('twake.space.sync.completed', {
      organizationId: listedAdmin.organizationId,
      spaceIds: [listed.space.id]
    })

    expect(await spaceBoards(goneAdmin)).toEqual([])
    expect(await spaceBoards(listedAdmin)).toHaveLength(1)
    expect(await spaceBoards(newerAdmin)).toHaveLength(1)
    expect(await spaceBoards(elsewhere)).toHaveLength(1)
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.key, `${PURGE_SPACE_JOB}:${gone.space.id}`))
    expect(job).toBeDefined()
  })

  it('deletes every space of an organization that has none left', async () => {
    const admin = aUser()
    await aSpaceWithATask(admin, [])

    await deliver('twake.space.sync.completed', {
      organizationId: admin.organizationId,
      spaceIds: []
    })

    expect(await spaceBoards(admin)).toEqual([])
  })
})

describe('knowsAnySpace', () => {
  it('sees spaces of any organization', async () => {
    const admin = aUser()
    await aSpaceWithATask(admin, [])

    expect(await knowsAnySpace(db)).toBe(true)
  })
})
