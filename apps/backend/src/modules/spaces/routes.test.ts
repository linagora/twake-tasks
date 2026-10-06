import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import type { PlatformEvent } from '../../events/envelope.ts'
import { createDb } from '../../infra/db.ts'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'
import { spaceRoutes } from './events.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

async function aSpace(admin: TestUser) {
  const id = randomUUID()
  const handler = spaceRoutes().get('twake.space.created')
  const event: PlatformEvent = {
    routingKey: 'twake.space.created',
    messageId: randomUUID(),
    body: {
      organizationId: admin.organizationId,
      id,
      name: 'Ops',
      members: [{ uuid: admin.userId, email: admin.email, role: 'admin' }]
    }
  }
  await db.transaction(tx => handler?.(event, tx) ?? Promise.resolve())
  return id
}

describe('the project of a space', () => {
  it('answers the project a member sees the space boards in', async () => {
    const admin = aUser()
    const spaceId = await aSpace(admin)
    const projects = (await api.as(admin).get('/projects')).json<{
      projects: { id: string }[]
    }>().projects

    const response = await api.as(admin).get(`/spaces/${spaceId}/project`)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ id: projects[0]?.id })
  })

  it('hides it from people outside the space', async () => {
    const admin = aUser()
    const spaceId = await aSpace(admin)
    const colleague = aUser({ organizationId: admin.organizationId })

    const response = await api.as(colleague).get(`/spaces/${spaceId}/project`)

    expect(response.statusCode).toBe(404)
    expect(
      (await api.as(admin).get(`/spaces/${randomUUID()}/project`)).statusCode
    ).toBe(404)
  })

  it('is not served without the space integration', async () => {
    const admin = aUser()
    const spaceId = await aSpace(admin)
    const standalone = await startApp({ spaces: false })

    const response = await standalone
      .as(admin)
      .get(`/spaces/${spaceId}/project`)
    await standalone.close()

    expect(response.statusCode).toBe(404)
  })
})
