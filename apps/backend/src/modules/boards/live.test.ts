import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb, inTenant } from '../../infra/db.ts'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'
import { openStream } from '../../testing/stream.ts'
import { bumpBoard } from './tasks.ts'

let api: Awaited<ReturnType<typeof startApp>>
let baseUrl: string
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
  baseUrl = await api.listen()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

async function aBoardOf(owner: TestUser, projectId?: string) {
  return (
    await api
      .as(owner)
      .post('/boards', { name: 'Design', keyPrefix: 'DES', projectId })
  ).json<{ id: string; project: { id: string }; sections: { id: string }[] }>()
}

const openBoardStream = (user: TestUser, boardId: string) =>
  openStream(`${baseUrl}/api/boards/${boardId}/events`, api.tokenOf(user))

async function nextVersion(stream: ReturnType<typeof openBoardStream>) {
  return Number((await stream.messages.next()).value?.id)
}

describe('live board updates', () => {
  it('sends the board version, then each new version as the board changes', async () => {
    const alice = aUser()
    const board = await aBoardOf(alice)
    const stream = openBoardStream(alice, board.id)

    const first = (await stream.messages.next()).value
    await api.as(alice).post(`/boards/${board.id}/tasks`, {
      sectionId: board.sections[0]?.id,
      title: 'Logo'
    })
    const second = (await stream.messages.next()).value
    stream.close()

    expect((await stream.response).headers.get('content-type')).toBe(
      'text/event-stream'
    )
    expect(Number(second?.id)).toBe(Number(first?.id) + 1)
    expect(JSON.parse(second?.data ?? '')).toEqual({
      version: Number(second?.id)
    })
  })

  it('tells nothing of a change that is rolled back', async () => {
    const alice = aUser()
    const board = await aBoardOf(alice)
    const stream = openBoardStream(alice, board.id)
    const first = await nextVersion(stream)

    await inTenant(db, alice, async tx => {
      await bumpBoard(tx, board.id)
      throw new Error('rolled back')
    }).catch(() => undefined)
    await api.as(alice).patch(`/boards/${board.id}`, { name: 'Brand' })
    await api.as(alice).patch(`/boards/${board.id}`, { name: 'Design' })

    expect([await nextVersion(stream), await nextVersion(stream)]).toEqual([
      first + 1,
      first + 2
    ])
    stream.close()
  })

  it('tells every board of the project of a label edit', async () => {
    const alice = aUser()
    const design = await aBoardOf(alice)
    const ops = await aBoardOf(alice, design.project.id)
    const label = (
      await api.as(alice).post(`/boards/${design.id}/labels`, {
        name: 'Urgent'
      })
    ).json<{ id: string }>()
    const stream = openBoardStream(alice, ops.id)
    const first = await nextVersion(stream)

    await api
      .as(alice)
      .patch(`/boards/${design.id}/labels/${label.id}`, { color: '#273891' })

    expect(await nextVersion(stream)).toBe(first + 1)
    stream.close()
  })

  it('tells of a board archived, then restored', async () => {
    const alice = aUser()
    const board = await aBoardOf(alice)
    const stream = openBoardStream(alice, board.id)
    const first = await nextVersion(stream)

    await api.as(alice).post(`/boards/${board.id}/archive`, {})
    await api.as(alice).post(`/boards/${board.id}/unarchive`, {})

    expect([await nextVersion(stream), await nextVersion(stream)]).toEqual([
      first + 1,
      first + 2
    ])
    stream.close()
  })

  it('opens a stream for an invite the guest has not listed yet', async () => {
    const alice = aUser()
    const guest = aUser({ organizationId: alice.organizationId })
    const board = await aBoardOf(alice)
    await api.as(alice).post(`/boards/${board.id}/invites`, {
      email: guest.email,
      role: 'viewer'
    })
    const stream = openBoardStream(guest, board.id)

    expect((await stream.response).status).toBe(200)
    stream.close()
  })

  it('refuses a stream on a board the person cannot see', async () => {
    const board = await aBoardOf(aUser())
    const stream = openBoardStream(aUser(), board.id)

    expect((await stream.response).status).toBe(404)
    stream.close()
  })
})
