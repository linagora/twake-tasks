import { randomUUID } from 'node:crypto'
import { and, eq, sql as raw } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import type { PlatformEvent } from '../../events/envelope.ts'
import { RejectedEventError } from '../../events/router.ts'
import { asOrganization, asTenant, createDb } from '../../infra/db.ts'
import { jobs } from '../../scheduler/schema.ts'
import {
  aB2cUser,
  aBoardIn,
  aManagedProject,
  aUser,
  joinBoard,
  startApp,
  type TestUser
} from '../../testing/app.ts'
import { keepSettings } from '../settings/events.ts'
import { userSettings } from '../settings/schema.ts'
import { accountRoutes } from './accounts.ts'
import { projects } from './schema.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

function deliver(routingKey: string, body: object) {
  const handler = accountRoutes.get(routingKey)
  if (!handler) throw new Error(`no handler for ${routingKey}`)
  const event: PlatformEvent = { routingKey, messageId: randomUUID(), body }
  return db.transaction(tx => handler(event, tx))
}

interface Board {
  id: string
  name: string
  role: string
  inbox: boolean
}

const boardsOf = async (user: TestUser) =>
  (await api.as(user).get('/boards')).json<{ boards: Board[] }>().boards

async function aBoard(
  owner: TestUser,
  name: string,
  members: [TestUser, 'viewer' | 'editor' | 'admin'][]
) {
  const board = (
    await api.as(owner).post('/boards', {
      name,
      keyPrefix: name.toUpperCase().slice(0, 3)
    })
  ).json<{ id: string }>()
  for (const [user, role] of members) {
    await joinBoard(db, owner, board.id, user, role)
  }
  const task = (
    await api
      .as(owner)
      .post(`/boards/${board.id}/tasks`, { sectionId: null, title: 'Logo' })
  ).json<{ id: string }>()
  await api.as(owner).put(`/boards/${board.id}/tasks/${task.id}/assignees`, {
    userIds: [owner.userId, ...members.map(([user]) => user.userId)]
  })
  const assignees = async (viewer: TestUser) =>
    (await api.as(viewer).get(`/boards/${board.id}`))
      .json<{ tasks: { assignees: { userId: string }[] }[] }>()
      .tasks[0]?.assignees.map(person => person.userId)
  return { id: board.id, assignees }
}

const filtersOf = async (user: TestUser) =>
  (await api.as(user).get('/filters')).json<{ filters: object[] }>().filters

async function personalProjectsOf(user: TestUser) {
  return db.transaction(async tx => {
    await asTenant(tx, user)
    return tx
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(eq(projects.personal, true), eq(projects.createdBy, user.userId))
      )
  })
}

describe.each([
  {
    kind: 'B2B, matched by email',
    routingKey: 'domain.user.deleted',
    makeUser: () => aUser(),
    body: (user: TestUser) => ({
      organizationId: user.organizationId,
      internalEmail: user.email
    })
  },
  {
    kind: 'B2B, matched by uuid',
    routingKey: 'domain.user.deleted',
    makeUser: () => aUser(),
    body: (user: TestUser) => ({
      organizationId: user.organizationId,
      uuid: user.userId
    })
  },
  {
    kind: 'B2C, matched by uuid',
    routingKey: 'user.deleted',
    makeUser: () => aB2cUser(),
    body: (user: TestUser) => ({ uuid: user.userId })
  },
  {
    kind: 'B2C, matched by email',
    routingKey: 'user.deleted',
    makeUser: () => aB2cUser(),
    body: (user: TestUser) => ({ internalEmail: user.email })
  }
])('a deleted account ($kind)', ({ routingKey, makeUser, body }) => {
  it('leaves its boards, hands them on or deletes them, and loses its Inbox', async () => {
    const gone = makeUser()
    const peer = (): TestUser =>
      gone.organizationId
        ? aUser({ organizationId: gone.organizationId })
        : aB2cUser()
    const firstEditor = peer()
    const laterEditor = peer()
    const viewer = peer()
    await boardsOf(gone)
    const handedOn = await aBoard(gone, 'Home', [
      [firstEditor, 'editor'],
      [laterEditor, 'editor']
    ])
    await aBoard(gone, 'Solo', [[viewer, 'viewer']])

    await deliver(routingKey, body(gone))

    expect((await boardsOf(firstEditor)).filter(board => !board.inbox)).toEqual(
      [expect.objectContaining({ name: 'Home', role: 'admin' })]
    )
    expect((await boardsOf(laterEditor)).filter(board => !board.inbox)).toEqual(
      [expect.objectContaining({ name: 'Home', role: 'editor' })]
    )
    expect((await boardsOf(viewer)).filter(board => !board.inbox)).toEqual([])
    expect(await handedOn.assignees(firstEditor)).toEqual(
      expect.not.arrayContaining([gone.userId])
    )
    expect(await personalProjectsOf(gone)).toEqual([])
  })

  it('loses its saved filters', async () => {
    const gone = makeUser()
    await boardsOf(gone)
    await api
      .as(gone)
      .post('/filters', { name: 'Mine', criteria: { priority: 1 } })

    await deliver(routingKey, body(gone))

    expect(await filtersOf(gone)).toEqual([])
  })

  it('loses its Twake Workplace settings', async () => {
    const gone = makeUser()
    await boardsOf(gone)
    await db.transaction(tx =>
      keepSettings(tx, 1, { email: gone.email, display_name: 'Gone' })
    )

    await deliver(routingKey, body(gone))

    expect(
      await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.email, gone.email.toLowerCase()))
    ).toEqual([])
  })
})

describe('a deleted account in a managed project', () => {
  it('leaves the project to its integration, even as its only admin', async () => {
    const gone = aUser()
    const viewer = aUser({ organizationId: gone.organizationId })
    const projectId = await aManagedProject(db, [
      [gone, 'admin'],
      [viewer, 'viewer']
    ])
    await aBoardIn(db, gone, projectId, { name: 'Launch', keyPrefix: 'LCH' })

    await deliver('domain.user.deleted', {
      organizationId: gone.organizationId,
      uuid: gone.userId
    })

    expect(await boardsOf(viewer)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Launch', role: 'viewer' })
      ])
    )
  })
})

describe('deleted accounts that cannot be applied', () => {
  it('rejects a B2B deletion without an organization', async () => {
    await expect(
      deliver('domain.user.deleted', { internalEmail: 'a@example.com' })
    ).rejects.toThrow(RejectedEventError)
  })

  it('rejects a B2C deletion without a uuid or an email', async () => {
    await expect(deliver('user.deleted', { userId: 'alice' })).rejects.toThrow(
      RejectedEventError
    )
  })
})

describe('a deleted organization', () => {
  async function projectsOf(organizationId: string | null) {
    return db.transaction(async tx => {
      await asOrganization(tx, organizationId)
      return tx.select({ id: projects.id }).from(projects)
    })
  }

  const jobsOf = (organizationId: string | null) =>
    db
      .select({ id: jobs.id })
      .from(jobs)
      .where(raw`${jobs.payload}->>'organizationId' = ${organizationId}`)

  async function aBoardWithReminder(owner: TestUser, filterer: TestUser) {
    const board = await aBoard(owner, 'Launch', [])
    const [task] = (await api.as(owner).get(`/boards/${board.id}`)).json<{
      tasks: { id: string }[]
    }>().tasks
    if (!task) throw new Error('no task')
    const path = `/boards/${board.id}/tasks/${task.id}`
    await api.as(owner).patch(path, { dueDate: '2099-03-10' })
    await api
      .as(owner)
      .post(`${path}/reminders`, { beforeMinutes: 30, zone: 'Europe/Paris' })
    await api
      .as(filterer)
      .post('/filters', { name: 'Mine', criteria: { priority: 1 } })
  }

  it('erases everything the organization holds, and nothing of another', async () => {
    const owner = aUser()
    const organizationId = owner.organizationId
    const colleague = aUser({ organizationId })
    const outsider = aUser()
    await aBoardWithReminder(owner, colleague)
    await aManagedProject(db, [[colleague, 'admin']])
    await aBoardWithReminder(outsider, outsider)
    expect(await jobsOf(organizationId)).not.toEqual([])

    await deliver('domain.organization.deleted', {
      emitter: 'twake-ldap-rest',
      type: 'organization.deleted',
      organizationId,
      domain: 'example.com',
      reason: 'closed'
    })

    expect(await projectsOf(organizationId)).toEqual([])
    expect(await jobsOf(organizationId)).toEqual([])
    expect(await filtersOf(colleague)).toEqual([])
    expect(await projectsOf(outsider.organizationId)).not.toEqual([])
    expect(await jobsOf(outsider.organizationId)).not.toEqual([])
    expect(await filtersOf(outsider)).not.toEqual([])
  })

  it('changes nothing when replayed', async () => {
    const owner = aUser()
    await aBoard(owner, 'Launch', [])
    const body = { organizationId: owner.organizationId }

    await deliver('domain.organization.deleted', body)
    await deliver('domain.organization.deleted', body)

    expect(await projectsOf(owner.organizationId)).toEqual([])
  })

  it('rejects a deletion without an organization', async () => {
    await expect(
      deliver('domain.organization.deleted', { domain: 'example.com' })
    ).rejects.toThrow(RejectedEventError)
  })
})
