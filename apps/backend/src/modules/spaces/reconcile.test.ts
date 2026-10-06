import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import type { PlatformEvent } from '../../events/envelope.ts'
import { createDb } from '../../infra/db.ts'
import type { LdapRest, RemoteSpace } from '../../infra/ldapRest.ts'
import { jobs } from '../../scheduler/schema.ts'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'
import { spaceRoutes } from './events.ts'
import {
  RECONCILE_SPACE_JOB,
  RECONCILE_SPACES_JOB,
  reconcileSpace,
  reconcileSpaces
} from './reconcile.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

function fakeLdapRest(organizationId: string, remote: RemoteSpace[]): LdapRest {
  return {
    organizations: () => Promise.resolve([organizationId]),
    spaceIds: () => Promise.resolve(remote.map(space => space.id)),
    space: (_org, id) =>
      Promise.resolve(remote.find(space => space.id === id) ?? null)
  }
}

const member = (user: TestUser, role: 'viewer' | 'editor' | 'admin') => ({
  uuid: user.userId,
  email: user.email,
  role
})

async function spaceBoards(user: TestUser) {
  return (await api.as(user).get('/boards'))
    .json<{
      boards: { name: string; project: { managed: boolean }; role: string }[]
    }>()
    .boards.filter(board => board.project.managed)
}

const run = (ldapRest: LdapRest, spaceId: string, organizationId: string) =>
  db.transaction(tx =>
    reconcileSpace(ldapRest)({ organizationId, spaceId }, tx)
  )

function deliver(routingKey: string, body: object) {
  const handler = spaceRoutes().get(routingKey)
  if (!handler) throw new Error(`no handler for ${routingKey}`)
  const event: PlatformEvent = { routingKey, messageId: randomUUID(), body }
  return db.transaction(tx => handler(event, tx))
}

describe('reconciling a space', () => {
  it('creates a space whose event was missed, with its members', async () => {
    const admin = aUser()
    const viewer = aUser({ organizationId: admin.organizationId })
    const org = admin.organizationId ?? ''
    const space = {
      id: randomUUID(),
      name: 'Roadmap',
      members: [member(admin, 'admin'), member(viewer, 'viewer')]
    }

    await run(fakeLdapRest(org, [space]), space.id, org)

    expect(await spaceBoards(admin)).toEqual([
      expect.objectContaining({ name: 'Roadmap', role: 'admin' })
    ])
    expect(await spaceBoards(viewer)).toEqual([
      expect.objectContaining({ role: 'viewer' })
    ])
  })

  it('repairs the name, the roles, and takes the board from people who left', async () => {
    const admin = aUser()
    const leaver = aUser({ organizationId: admin.organizationId })
    const promoted = aUser({ organizationId: admin.organizationId })
    const org = admin.organizationId ?? ''
    const id = randomUUID()
    await deliver('twake.space.created', {
      organizationId: org,
      id,
      name: 'Ops',
      members: [
        member(admin, 'admin'),
        member(leaver, 'editor'),
        member(promoted, 'viewer')
      ]
    })

    await run(
      fakeLdapRest(org, [
        {
          id,
          name: 'Operations',
          members: [member(admin, 'admin'), member(promoted, 'editor')]
        }
      ]),
      id,
      org
    )

    expect(await spaceBoards(leaver)).toEqual([])
    expect(await spaceBoards(promoted)).toEqual([
      expect.objectContaining({ role: 'editor' })
    ])
    expect(
      (await api.as(admin).get('/projects')).json<{
        projects: { name: string; managed: boolean }[]
      }>().projects
    ).toContainEqual(
      expect.objectContaining({ name: 'Operations', managed: true })
    )
  })

  it('deletes a space ldap-rest no longer has', async () => {
    const admin = aUser()
    const org = admin.organizationId ?? ''
    const id = randomUUID()
    await deliver('twake.space.created', {
      organizationId: org,
      id,
      name: 'Gone',
      members: [member(admin, 'admin')]
    })

    await run(fakeLdapRest(org, []), id, org)

    expect(await spaceBoards(admin)).toEqual([])
  })
})

describe('the nightly reconcile', () => {
  it('plans a repair of every space, then runs again the next day', async () => {
    const admin = aUser()
    const org = admin.organizationId ?? ''
    const local = randomUUID()
    const remote = randomUUID()
    await deliver('twake.space.created', {
      organizationId: org,
      id: local,
      name: 'Local',
      members: [member(admin, 'admin')]
    })

    const outcome = await db.transaction(tx =>
      reconcileSpaces(
        fakeLdapRest(org, [{ id: remote, name: 'Remote', members: [] }])
      )({}, tx)
    )

    expect(outcome).toBe('keep')
    const planned = await db
      .select({ key: jobs.key, payload: jobs.payload })
      .from(jobs)
      .where(eq(jobs.kind, RECONCILE_SPACE_JOB))
    expect(planned).toEqual(
      expect.arrayContaining([
        {
          key: `${RECONCILE_SPACE_JOB}:${local}`,
          payload: { organizationId: org, spaceId: local }
        },
        {
          key: `${RECONCILE_SPACE_JOB}:${remote}`,
          payload: { organizationId: org, spaceId: remote }
        }
      ])
    )
    const [next] = await db
      .select({ runAt: jobs.runAt })
      .from(jobs)
      .where(eq(jobs.key, RECONCILE_SPACES_JOB))
    if (!next) throw new Error('the reconcile is not planned again')
    const hours = (next.runAt.getTime() - Date.now()) / 3_600_000
    expect(Math.round(hours)).toBe(24)
  })
})
