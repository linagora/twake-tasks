import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { aUser, joinBoard, startApp, type TestUser } from '../../testing/app.ts'

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

async function aBoard(user: TestUser, keyPrefix = 'DES', projectId?: string) {
  const board = (
    await api.as(user).post('/boards', { name: 'Design', keyPrefix, projectId })
  ).json<{ id: string; project: { id: string } }>()
  return { ...on(user, board.id), projectId: board.project.id }
}

describe('labels', () => {
  it('puts a new label on a task', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
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

  it("shares a project's labels across its boards, not with other projects", async () => {
    const alice = aUser()
    const design = await aBoard(alice, 'DES')
    const ops = await aBoard(alice, 'OPS', design.projectId)
    const elsewhere = await aBoard(alice, 'ELS')

    const label = (await design.addLabel('Urgent')).json<Label>()
    const task = await ops.addTask()

    expect((await ops.label(task.id, [label.id])).statusCode).toBe(204)
    expect((await ops.load()).labels).toEqual([label])
    expect((await elsewhere.load()).labels).toEqual([])
    const other = await elsewhere.addTask()
    const refused = await elsewhere.label(other.id, [label.id])
    expect(refused.statusCode).toBe(400)
    expect(refused.json()).toEqual({ error: 'invalid_label' })
  })

  it('refuses a name already used in the scope', async () => {
    const alice = aUser()
    const board = await aBoard(alice)
    await board.addLabel('Urgent')

    const again = await board.addLabel('Urgent')

    expect(again.statusCode).toBe(409)
    expect(again.json()).toEqual({ error: 'label_taken' })
  })

  it('keeps viewers from labeling', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const board = await aBoard(alice)
    const task = await board.addTask()
    const label = (await board.addLabel('Urgent')).json<Label>()
    const { id: boardId } = await board.load()
    await joinBoard(db, alice, boardId, bob, 'viewer')
    const asBob = on(bob, boardId)

    expect((await asBob.addLabel('Later')).statusCode).toBe(403)
    expect((await asBob.label(task.id, [label.id])).statusCode).toBe(403)
    expect((await asBob.load()).labels).toEqual([label])
  })
})
