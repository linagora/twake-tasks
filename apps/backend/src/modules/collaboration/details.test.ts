import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../../infra/db.ts'
import { aUser, joinBoard, startApp, type TestUser } from '../../testing/app.ts'

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
  const newTask = async (title: string) =>
    (
      await api.as(owner).post(`/boards/${board.id}/tasks`, {
        sectionId: board.sections[0]?.id,
        title
      })
    ).json<{ id: string }>().id
  return { boardId: board.id, taskId: await newTask('Logo'), newTask }
}

describe('task details', () => {
  it('answers with what the six reads of the task dialog answer', async () => {
    const alice = aUser()
    const { boardId, taskId, newTask } = await aTaskOf(alice)
    const at = `/boards/${boardId}/tasks/${taskId}`
    await api
      .as(alice)
      .put(`${at}/description`, { markdown: 'Plan', version: 0 })
    await api.as(alice).post(`${at}/comments`, { body: 'Looks good' })
    await api
      .as(alice)
      .post(`${at}/reminders`, { at: '2099-01-01T09:00:00.000Z' })
    await api
      .as(alice)
      .post(`${at}/links`, { kind: 'blockedBy', taskId: await newTask('Kick') })
    await api.as(alice).put(`${at}/follow`)
    const read = async (path: string) =>
      (await api.as(alice).get(`${at}/${path}`)).json<Record<string, unknown>>()

    const details = await api.as(alice).get(`${at}/details`)

    expect(details.statusCode).toBe(200)
    expect(details.json()).toEqual({
      description: await read('description'),
      comments: (await read('comments')).comments,
      history: (await read('history')).entries,
      links: await read('links'),
      reminders: (await read('reminders')).reminders,
      following: (await read('follow')).following
    })
    expect(details.json()).toMatchObject({
      description: { markdown: 'Plan', version: 1 },
      comments: [{ body: 'Looks good' }],
      links: { blockedBy: [{ task: { title: 'Kick' } }] },
      reminders: [{ at: '2099-01-01T09:00:00.000Z' }],
      following: true
    })
  })

  it('gives a viewer their own reminders and following, and hides the task from outsiders', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const { boardId, taskId } = await aTaskOf(alice)
    const at = `/boards/${boardId}/tasks/${taskId}`
    await joinBoard(db, alice, boardId, bob, 'viewer')
    await api
      .as(alice)
      .post(`${at}/reminders`, { at: '2099-01-01T09:00:00.000Z' })
    await api.as(alice).put(`${at}/follow`)

    expect((await api.as(bob).get(`${at}/details`)).json()).toMatchObject({
      reminders: [],
      following: false
    })
    expect((await api.as(aUser()).get(`${at}/details`)).statusCode).toBe(404)
    expect(
      (
        await api
          .as(alice)
          .get(`/boards/${boardId}/tasks/${crypto.randomUUID()}/details`)
      ).statusCode
    ).toBe(404)
  })
})
