import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb, inTenant } from '../../infra/db.ts'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'
import { boardMembers, tasks } from './schema.ts'

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

async function aTaskOf(owner: TestUser) {
  const board = (
    await api.as(owner).post('/boards', { name: 'Design', keyPrefix: 'DES' })
  ).json<{ id: string; sections: { id: string }[] }>()
  const task = (
    await api.as(owner).post(`/boards/${board.id}/tasks`, {
      sectionId: board.sections[0]?.id,
      title: 'Logo'
    })
  ).json<{ id: string }>()
  return { boardId: board.id, taskId: task.id }
}

describe('task description', () => {
  it('saves Markdown and keeps a plain text copy', async () => {
    const alice = aUser()
    const { boardId, taskId } = await aTaskOf(alice)
    const path = `/boards/${boardId}/tasks/${taskId}/description`

    const empty = await api.as(alice).get(path)
    const saved = await api.as(alice).put(path, {
      markdown: '# Brief\n\nUse the **new** [palette](https://example.com).',
      version: 0
    })
    const [row] = await inTenant(db, alice, tx =>
      tx
        .select({ text: tasks.descriptionText })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.boardId, boardId)))
    )

    expect(empty.json()).toEqual({ markdown: '', version: 0 })
    expect(saved.statusCode).toBe(200)
    expect(saved.json()).toEqual({ version: 1 })
    expect((await api.as(alice).get(path)).json()).toEqual({
      markdown: '# Brief\n\nUse the **new** [palette](https://example.com).',
      version: 1
    })
    expect(row?.text).toBe('Brief\nUse the new palette.')
  })

  it('refuses an edit made on a stale version', async () => {
    const alice = aUser()
    const { boardId, taskId } = await aTaskOf(alice)
    const path = `/boards/${boardId}/tasks/${taskId}/description`
    await api.as(alice).put(path, { markdown: 'First', version: 0 })

    const stale = await api
      .as(alice)
      .put(path, { markdown: 'Late', version: 0 })

    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toEqual({ error: 'stale_version' })
    expect((await api.as(alice).get(path)).json()).toEqual({
      markdown: 'First',
      version: 1
    })
  })

  it('lets viewers read it and only editors change it', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const { boardId, taskId } = await aTaskOf(alice)
    const path = `/boards/${boardId}/tasks/${taskId}/description`
    await inTenant(db, alice, tx =>
      tx.insert(boardMembers).values({
        boardId,
        organizationId: alice.organizationId,
        userId: bob.userId,
        email: bob.email,
        role: 'viewer'
      })
    )

    expect((await api.as(bob).get(path)).statusCode).toBe(200)
    expect(
      (await api.as(bob).put(path, { markdown: 'Mine', version: 0 })).statusCode
    ).toBe(403)
    expect((await api.as(aUser()).get(path)).statusCode).toBe(404)
  })
})
