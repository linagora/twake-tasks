import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb, inTenant } from '../../infra/db.ts'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'
import { spaceMembers, spaces } from '../spaces/schema.ts'
import { boardMembers, boards } from './schema.ts'

interface Label {
  id: string
  name: string
}

interface Board {
  id: string
  labels: Label[]
  tasks: { id: string; labels: Label[] }[]
}

let api: Awaited<ReturnType<typeof startApp>>
const { sql, db } = createDb(inject('databaseUrl'))

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
  await sql.end()
})

function on(user: TestUser, boardId: string) {
  const as = api.as(user)
  return {
    load: async () => (await as.get(`/boards/${boardId}`)).json<Board>(),
    addLabel: (name: string) => as.post(`/boards/${boardId}/labels`, { name }),
    addTask: async () =>
      (
        await as.post(`/boards/${boardId}/tasks`, {
          sectionId: null,
          title: 'Logo'
        })
      ).json<{ id: string }>(),
    label: (taskId: string, labelIds: string[]) =>
      as.put(`/boards/${boardId}/tasks/${taskId}/labels`, { labelIds })
  }
}

async function aPersonalBoard(user: TestUser, keyPrefix = 'DES') {
  const board = (
    await api.as(user).post('/boards', { name: 'Design', keyPrefix })
  ).json<{ id: string }>()
  return on(user, board.id)
}

async function aSpaceBoard(
  user: TestUser,
  spaceId: string,
  keyPrefix: string
): Promise<string> {
  return inTenant(db, user, async tx => {
    const [board] = await tx
      .insert(boards)
      .values({
        organizationId: user.organizationId,
        spaceId,
        name: keyPrefix,
        keyPrefix,
        createdBy: user.userId
      })
      .returning({ id: boards.id })
    return board?.id ?? ''
  })
}

describe('labels', () => {
  it('puts a new label on a task', async () => {
    const alice = aUser()
    const board = await aPersonalBoard(alice)
    const task = await board.addTask()

    const created = await board.addLabel('Urgent')
    const label = created.json<Label>()
    const labeled = await board.label(task.id, [label.id])

    expect(created.statusCode).toBe(201)
    expect(labeled.statusCode).toBe(204)
    const loaded = await board.load()
    expect(loaded.labels).toEqual([{ id: label.id, name: 'Urgent' }])
    expect(loaded.tasks[0]?.labels).toEqual([{ id: label.id, name: 'Urgent' }])
  })

  it("shares a user's labels across their personal boards", async () => {
    const alice = aUser()
    const design = await aPersonalBoard(alice, 'DES')
    const ops = await aPersonalBoard(alice, 'OPS')

    const label = (await design.addLabel('Urgent')).json<Label>()
    const task = await ops.addTask()

    expect((await ops.label(task.id, [label.id])).statusCode).toBe(204)
    expect((await ops.load()).labels).toEqual([label])
  })

  it("shares a space's labels across its boards, not with personal ones", async () => {
    const alice = aUser()
    const spaceId = randomUUID()
    await inTenant(db, alice, async tx => {
      await tx.insert(spaces).values({
        id: spaceId,
        organizationId: alice.organizationId ?? '',
        name: 'Marketing'
      })
      await tx.insert(spaceMembers).values({
        spaceId,
        organizationId: alice.organizationId ?? '',
        userId: alice.userId,
        email: alice.email,
        role: 'editor'
      })
    })
    const launch = on(alice, await aSpaceBoard(alice, spaceId, 'LCH'))
    const press = on(alice, await aSpaceBoard(alice, spaceId, 'PRS'))
    const personal = await aPersonalBoard(alice)

    const label = (await launch.addLabel('Urgent')).json<Label>()

    expect((await press.load()).labels).toEqual([label])
    expect((await personal.load()).labels).toEqual([])
    const task = await personal.addTask()
    const refused = await personal.label(task.id, [label.id])
    expect(refused.statusCode).toBe(400)
    expect(refused.json()).toEqual({ error: 'invalid_label' })
  })

  it('refuses a name already used in the scope', async () => {
    const alice = aUser()
    const board = await aPersonalBoard(alice)
    await board.addLabel('Urgent')

    const again = await board.addLabel('Urgent')

    expect(again.statusCode).toBe(409)
    expect(again.json()).toEqual({ error: 'label_taken' })
  })

  it('keeps viewers from labeling', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const board = await aPersonalBoard(alice)
    const task = await board.addTask()
    const label = (await board.addLabel('Urgent')).json<Label>()
    const { id: boardId } = await board.load()
    await inTenant(db, alice, tx =>
      tx.insert(boardMembers).values({
        boardId,
        organizationId: alice.organizationId,
        userId: bob.userId,
        email: bob.email,
        role: 'viewer'
      })
    )
    const asBob = on(bob, boardId)

    expect((await asBob.addLabel('Later')).statusCode).toBe(403)
    expect((await asBob.label(task.id, [label.id])).statusCode).toBe(403)
    expect((await asBob.load()).labels).toEqual([label])
  })
})
