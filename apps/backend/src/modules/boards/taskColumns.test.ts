import { drizzle } from 'drizzle-orm/postgres-js'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { anIdentity } from '../auth/testing.ts'
import { aUser, startApp } from '../../testing/app.ts'
import { createViewStore } from '../views/store.ts'
import { createBoardStore } from './store.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql } = createDb(inject('databaseUrl'))

let statements: string[] = []
const logged = drizzle({
  client: sql,
  logger: {
    logQuery: query => {
      statements.push(query)
    }
  }
})
const store = createBoardStore(logged)
const views = createViewStore(logged)

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

const unused = /"(description|description_text|previous_keys)"/

describe('reading tasks for a list', () => {
  it('leaves the description and the old keys of the tasks in the database', async () => {
    const owner = aUser()
    const identity = anIdentity({ ...owner, subject: owner.email })
    const { id } = (
      await api.as(owner).post('/boards', { name: 'Launch', keyPrefix: 'LAU' })
    ).json<{ id: string }>()
    const task = (
      await api
        .as(owner)
        .post(`/boards/${id}/tasks`, { sectionId: null, title: 'Ship' })
    ).json<{ id: string }>()
    await api.as(owner).put(`/boards/${id}/tasks/${task.id}/assignees`, {
      userIds: [owner.userId]
    })

    statements = []
    const board = await store.getBoard(identity, id)
    const assigned = await views.assignedTasks(identity)

    expect(board?.tasks.map(t => t.title)).toEqual(['Ship'])
    expect(assigned.map(t => t.title)).toEqual(['Ship'])
    const reads = statements.filter(statement =>
      /\bfrom "tasks"/.test(statement)
    )
    expect(reads.length).toBeGreaterThanOrEqual(2)
    expect(reads.filter(statement => unused.test(statement))).toEqual([])
  })
})
