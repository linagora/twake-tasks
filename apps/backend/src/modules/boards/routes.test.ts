import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aB2cUser, aUser, startApp, type TestUser } from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
})

describe('user boards', () => {
  it('creates a board with the default sections', async () => {
    const alice = aUser()

    const response = await api
      .as(alice)
      .post('/boards', { name: 'Design', keyPrefix: 'DES' })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      name: 'Design',
      keyPrefix: 'DES',
      role: 'admin',
      sections: [
        { name: 'To do', category: 'unstarted' },
        { name: 'In progress', category: 'started' },
        { name: 'Done', category: 'completed' }
      ]
    })
  })

  it('lists only the boards a person belongs to', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const carol = aB2cUser()
    await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
    await api.as(bob).post('/boards', { name: 'Ops', keyPrefix: 'OPS' })
    await api.as(carol).post('/boards', { name: 'Home', keyPrefix: 'HOME' })

    const boardNames = async (user: TestUser) =>
      (await api.as(user).get('/boards'))
        .json<{
          boards: { name: string }[]
        }>()
        .boards.map(board => board.name)

    expect(await boardNames(alice)).toEqual(['Design'])
    expect(await boardNames(bob)).toEqual(['Ops'])
    expect(await boardNames(carol)).toEqual(['Home'])
  })

  it('opens a board for its members only', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const created = (
      await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
    ).json<{ id: string }>()

    const own = await api.as(alice).get(`/boards/${created.id}`)
    const other = await api.as(bob).get(`/boards/${created.id}`)
    const outsider = await api.as(aB2cUser()).get(`/boards/${created.id}`)
    const malformed = await api.as(alice).get('/boards/not-a-uuid')

    expect(own.statusCode).toBe(200)
    expect(own.json()).toMatchObject({
      id: created.id,
      name: 'Design',
      role: 'admin',
      sections: [{ name: 'To do' }, { name: 'In progress' }, { name: 'Done' }],
      tasks: []
    })
    expect(other.statusCode).toBe(404)
    expect(outsider.statusCode).toBe(404)
    expect(malformed.statusCode).toBe(404)
  })

  it('refuses a key prefix already used by the same owner', async () => {
    const alice = aUser()
    await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })

    const again = await api
      .as(alice)
      .post('/boards', { name: 'Desk', keyPrefix: 'DES' })
    const otherOwner = await api
      .as(aUser())
      .post('/boards', { name: 'Design', keyPrefix: 'DES' })

    expect(again.statusCode).toBe(409)
    expect(otherOwner.statusCode).toBe(201)
  })
})
