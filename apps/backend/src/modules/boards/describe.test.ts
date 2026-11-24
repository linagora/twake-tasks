import { asc, eq, TransactionRollbackError } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { asTenant } from '../../infra/db.ts'
import { aUser, startApp } from '../../testing/app.ts'
import type { Member } from './access.ts'
import { describeTasks } from './describe.ts'
import { boards, taskAssignees, tasks } from './schema.ts'

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

async function aBoardWith(
  titles: string[],
  members: Member[] = [],
  assigned: string[] = []
) {
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
  let described: Awaited<ReturnType<typeof describeTasks>> = []
  let sent: string[] = []
  await db
    .transaction(async tx => {
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
      for (const userId of assigned) {
        await tx.insert(taskAssignees).values({
          taskId: first,
          organizationId: board.organizationId,
          userId
        })
      }
      statements = []
      described = await describeTasks(tx, board, rows, members, [])
      sent = [...statements]
      // The assignees are not members of the project, which the invariants
      // checked after the suite refuse.
      tx.rollback()
    })
    .catch((error: unknown) => {
      if (!(error instanceof TransactionRollbackError)) throw error
    })
  return { described, statements: sent }
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

  it('reads the members of the board once, not once per task', async () => {
    const membersRead = async (titles: string[]) => {
      let reads = 0
      const members = new Proxy(
        Array.from({ length: 10 }, (_, i) => ({
          userId: crypto.randomUUID(),
          email: `member${String(i)}@example.com`,
          name: null,
          avatar: null
        })),
        {
          get(target, property, receiver) {
            if (typeof property === 'string' && /^\d+$/.test(property)) reads++
            return Reflect.get(target, property, receiver) as unknown
          }
        }
      )
      await aBoardWith(titles, members)
      return reads
    }

    expect(await membersRead(['One', 'Two', 'Three', 'Four'])).toBe(
      await membersRead(['One', 'Two'])
    )
  })

  it('shows the assignees still members, in the order of the members', async () => {
    const members = ['ada', 'bob', 'cy'].map(name => ({
      userId: crypto.randomUUID(),
      email: `${name}@example.com`,
      name,
      avatar: null
    }))
    const [ada, , cy] = members as [Member, Member, Member]

    const { described } = await aBoardWith(['One', 'Two'], members, [
      cy.userId,
      crypto.randomUUID(),
      ada.userId
    ])

    expect(described[0]?.assignees).toEqual([ada, cy])
    expect(described[1]?.assignees).toEqual([])
  })
})
