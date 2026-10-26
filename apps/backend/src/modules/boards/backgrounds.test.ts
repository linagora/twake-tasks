import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
})

interface Shown {
  background: string | null
  backgroundImage: string | null
}

const PICTURE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])

async function aBoard(owner: TestUser) {
  return (
    await api.as(owner).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<{ id: string } & Shown>()
}

const shownOn = async (user: TestUser, boardId: string): Promise<Shown> => {
  const { background, backgroundImage } = (
    await api.as(user).get(`/boards/${boardId}`)
  ).json<Shown>()
  return { background, backgroundImage }
}

const listedOn = async (user: TestUser, boardId: string) =>
  (await api.as(user).get('/boards'))
    .json<{ boards: ({ id: string } & Shown)[] }>()
    .boards.find(board => board.id === boardId)

const send = (
  user: TestUser,
  boardId: string,
  payload: Buffer,
  contentType = 'image/jpeg'
) =>
  api.inject({
    method: 'PUT',
    url: `/api/boards/${boardId}/background/image`,
    headers: {
      authorization: `Bearer ${api.tokenOf(user)}`,
      'content-type': contentType
    },
    payload
  })

async function aMember(owner: TestUser, boardId: string, role: string) {
  const member = aUser({ organizationId: owner.organizationId })
  await api
    .as(owner)
    .post(`/boards/${boardId}/invites`, { email: member.email, role })
  await api.as(member).get('/boards')
  return member
}

describe('board backgrounds', () => {
  it('starts with the default, until an admin picks a picture', async () => {
    const owner = aUser()
    const board = await aBoard(owner)

    expect(await shownOn(owner, board.id)).toEqual({
      background: null,
      backgroundImage: null
    })

    const response = await api
      .as(owner)
      .put(`/boards/${board.id}/background`, { background: 'dawn' })

    expect(response.statusCode).toBe(204)
    expect(await shownOn(owner, board.id)).toEqual({
      background: 'dawn',
      backgroundImage: null
    })
    expect(await listedOn(owner, board.id)).toMatchObject({
      background: 'dawn',
      backgroundImage: null
    })

    await api
      .as(owner)
      .put(`/boards/${board.id}/background`, { background: null })
    expect((await shownOn(owner, board.id)).background).toBeNull()
  })

  it('shows a picture an admin sent to every member, by an id of its own', async () => {
    const owner = aUser()
    const board = await aBoard(owner)
    const viewer = await aMember(owner, board.id, 'viewer')

    const response = await send(owner, board.id, PICTURE)

    expect(response.statusCode).toBe(201)
    const { image } = response.json<{ image: string }>()
    expect(await shownOn(viewer, board.id)).toEqual({
      background: 'custom',
      backgroundImage: image
    })
    expect(await listedOn(viewer, board.id)).toMatchObject({
      background: 'custom',
      backgroundImage: image
    })
    const fetched = await api
      .as(viewer)
      .get(`/boards/${board.id}/background/${image}`)
    expect(fetched.statusCode).toBe(200)
    expect(fetched.headers['content-type']).toBe('image/jpeg')
    expect(fetched.headers['cache-control']).toContain('immutable')
    expect(fetched.rawPayload).toEqual(PICTURE)
  })

  it('replaces the picture by the next one, and drops it for a shipped one', async () => {
    const owner = aUser()
    const board = await aBoard(owner)
    const first = (await send(owner, board.id, PICTURE)).json<{
      image: string
    }>().image

    const second = (await send(owner, board.id, PICTURE, 'image/png')).json<{
      image: string
    }>().image

    expect(second).not.toBe(first)
    expect(
      (await api.as(owner).get(`/boards/${board.id}/background/${first}`))
        .statusCode
    ).toBe(404)

    await api
      .as(owner)
      .put(`/boards/${board.id}/background`, { background: 'dawn' })
    expect(await shownOn(owner, board.id)).toEqual({
      background: 'dawn',
      backgroundImage: null
    })
    expect(
      (await api.as(owner).get(`/boards/${board.id}/background/${second}`))
        .statusCode
    ).toBe(404)
  })

  it('leaves the background to admins', async () => {
    const owner = aUser()
    const board = await aBoard(owner)
    const editor = await aMember(owner, board.id, 'editor')

    expect(
      (
        await api
          .as(editor)
          .put(`/boards/${board.id}/background`, { background: 'dawn' })
      ).statusCode
    ).toBe(403)
    expect((await send(editor, board.id, PICTURE)).statusCode).toBe(403)
    expect((await shownOn(owner, board.id)).background).toBeNull()
  })

  it('hides the board and its picture from strangers', async () => {
    const owner = aUser()
    const board = await aBoard(owner)
    const stranger = aUser({ organizationId: owner.organizationId })
    const { image } = (await send(owner, board.id, PICTURE)).json<{
      image: string
    }>()

    expect(
      (
        await api
          .as(stranger)
          .put(`/boards/${board.id}/background`, { background: 'dawn' })
      ).statusCode
    ).toBe(404)
    expect((await send(stranger, board.id, PICTURE)).statusCode).toBe(404)
    expect(
      (await api.as(stranger).get(`/boards/${board.id}/background/${image}`))
        .statusCode
    ).toBe(404)
  })

  it('refuses unknown pictures, other files and empty ones', async () => {
    const owner = aUser()
    const board = await aBoard(owner)

    expect(
      (
        await api
          .as(owner)
          .put(`/boards/${board.id}/background`, { background: 'custom' })
      ).statusCode
    ).toBe(400)
    expect(
      (
        await api
          .as(owner)
          .put(`/boards/${board.id}/background`, { background: 'eclipse' })
      ).statusCode
    ).toBe(400)
    expect(
      (await send(owner, board.id, PICTURE, 'image/svg+xml')).statusCode
    ).toBe(415)
    expect((await send(owner, board.id, Buffer.alloc(0))).statusCode).toBe(400)
  })

  it('refuses a picture larger than a screen needs', async () => {
    const owner = aUser()
    const board = await aBoard(owner)

    const response = await send(
      owner,
      board.id,
      Buffer.alloc(3 * 1024 * 1024, 1)
    )

    expect(response.statusCode).toBe(413)
    expect((await shownOn(owner, board.id)).background).toBeNull()
  })
})
