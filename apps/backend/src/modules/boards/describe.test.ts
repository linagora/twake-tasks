import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { asTenant } from '../../infra/db.ts'
import { aUser, startApp } from '../../testing/app.ts'
import { describeTasks } from './describe.ts'
import { boards, tasks } from './schema.ts'

let api: Awaited<ReturnType<typeof startApp>>
const client = postgres(inject('databaseUrl'), { onnotice: () => undefined })
let statements: string[] = []
const db = drizzle({
  client,
  logger: { logQuery: query => statements.push(query) }
})

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await client.end()
})

async function aBoardWith(titles: string[]) {
  const owner = aUser()
  const as = api.as(owner)
  const boardId = (
    await as.post('/boards', { name: 'Describe', keyPrefix: 'DSC' })
  ).json<{ id: string }>().id
  const ids: string[] = []
  for (const title of titles) {
    ids.push(
      (
        await as.post(`/boards/${boardId}/tasks`, { sectionId: null, title })
      ).json<{ id: string }>().id
    )
  }
  const [first, second] = ids as [string, string]
  await as.post(`/boards/${boardId}/tasks/${first}/comments`, { body: 'Hi' })
  await as.post(`/boards/${boardId}/tasks/${first}/links`, {
    kind: 'blockedBy',
    taskId: second
  })
  return db.transaction(async tx => {
    await asTenant(tx, owner)
    const [board] = (await tx
      .select()
      .from(boards)
      .where(eq(boards.id, boardId))) as [typeof boards.$inferSelect]
    const rows = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.boardId, boardId))
      .orderBy(asc(tasks.number))
    statements = []
    const described = await describeTasks(tx, board, rows, [], [])
    return { described, statements: [...statements] }
  })
}

describe('describing tasks', () => {
  it('sends the same statements whatever the number of tasks', async () => {
    const few = await aBoardWith(['One', 'Two'])
    const more = await aBoardWith(['One', 'Two', 'Three', 'Four'])

    expect(more.statements).toEqual(few.statements)
    expect(
      more.described.map(task => ({
        key: task.key,
        commentCount: task.commentCount,
        blockers: task.blockers
      }))
    ).toEqual([
      {
        key: 'DSC-1',
        commentCount: 1,
        blockers: [{ key: 'DSC-2', title: 'Two' }]
      },
      { key: 'DSC-2', commentCount: 0, blockers: [] },
      { key: 'DSC-3', commentCount: 0, blockers: [] },
      { key: 'DSC-4', commentCount: 0, blockers: [] }
    ])
  })
})
