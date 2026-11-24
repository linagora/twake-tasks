import { drizzle } from 'drizzle-orm/postgres-js'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { anIdentity } from '../auth/testing.ts'
import { aUser, startApp } from '../../testing/app.ts'
import { createBoardStore } from './store.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql } = createDb(inject('databaseUrl'))

let statements: string[] = []
const store = createBoardStore(
  drizzle({
    client: sql,
    logger: {
      logQuery: query => {
        statements.push(query)
      }
    }
  })
)

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

describe('listing boards again', () => {
  it('writes nothing once the Inbox, the invites and the name are settled', async () => {
    const owner = aUser({ name: 'Alice' })
    const identity = anIdentity({ ...owner, subject: owner.email })
    await api.as(owner).post('/boards', { name: 'Launch', keyPrefix: 'LAU' })
    await store.listBoards(identity)

    statements = []
    const boards = await store.listBoards(identity)

    expect(boards.map(board => board.name)).toEqual(['Inbox', 'Launch'])
    expect(
      statements.filter(statement =>
        /^\s*(insert|update|delete)\b|app_claim_invites/i.test(statement)
      )
    ).toEqual([])
  })

  it('names a member whose invite is claimed on the first list', async () => {
    const owner = aUser()
    const guest = aUser({ organizationId: owner.organizationId, name: 'Bob' })
    const { id } = (
      await api.as(owner).post('/boards', { name: 'Launch', keyPrefix: 'LAU' })
    ).json<{ id: string }>()
    await api
      .as(owner)
      .post(`/boards/${id}/invites`, { email: guest.email, role: 'editor' })

    const { boards } = (await api.as(guest).get('/boards')).json<{
      boards: {
        id: string
        members: { email: string; name: string | null }[]
      }[]
    }>()

    expect(
      boards
        .find(board => board.id === id)
        ?.members.find(member => member.email === guest.email)?.name
    ).toBe('Bob')
  })
})
