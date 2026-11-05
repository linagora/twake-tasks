import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
})

const ZONE = 'Pacific/Kiritimati'
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date())

async function aBoard(owner: TestUser) {
  const board = (
    await api.as(owner).post('/boards', { name: 'Launch', keyPrefix: 'LAU' })
  ).json<{ id: string }>()
  const path = `/boards/${board.id}`
  const newTask = async (body: object = {}) => {
    const { id } = (
      await api
        .as(owner)
        .post(`${path}/tasks`, { sectionId: null, title: 'Brief', ...body })
    ).json<{ id: string }>()
    const at = `${path}/tasks/${id}`
    return {
      id,
      at,
      complete: (state: string | null = 'completed') =>
        api.as(owner).post(`${at}/complete`, { state })
    }
  }
  return {
    newTask,
    progress: async (user = owner, zone = ZONE) =>
      api.as(user).get(`${path}/progress?zone=${zone}`)
  }
}

describe('board progress', () => {
  it('counts the completions of today, in the reader zone', async () => {
    const owner = aUser()
    const { newTask, progress } = await aBoard(owner)
    await (await newTask()).complete()
    await (await newTask()).complete()
    await newTask()

    const response = await progress()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ days: [{ day: today(), done: 2 }] })
  })

  it('counts each completion of a recurring task', async () => {
    const owner = aUser()
    const { newTask, progress } = await aBoard(owner)
    const task = await newTask()
    await api.as(owner).patch(task.at, {
      dueDate: '2099-01-05',
      recurrence: { every: 1, unit: 'weeks', fromCompletion: false }
    })
    await task.complete()
    await task.complete()

    expect((await progress()).json()).toEqual({
      days: [{ day: today(), done: 2 }]
    })
  })

  it('leaves out what was reopened or canceled since, and what is not shown', async () => {
    const owner = aUser()
    const { newTask, progress } = await aBoard(owner)
    const reopened = await newTask()
    await reopened.complete()
    await reopened.complete(null)
    const canceled = await newTask()
    await canceled.complete()
    await canceled.complete('canceled')
    const trashed = await newTask()
    await trashed.complete()
    await api.as(owner).delete(trashed.at)
    const parent = await newTask()
    const subtask = await newTask({ sectionId: undefined, parentId: parent.id })
    expect((await subtask.complete()).statusCode).toBe(204)

    expect((await progress()).json()).toEqual({ days: [] })

    await reopened.complete()
    expect((await progress()).json()).toEqual({
      days: [{ day: today(), done: 1 }]
    })
  })

  it('keeps finished work counted once it is archived', async () => {
    const owner = aUser()
    const { newTask, progress } = await aBoard(owner)
    const archived = await newTask()
    await archived.complete()
    await api.as(owner).post(`${archived.at}/archive`, {})

    expect((await progress()).json()).toEqual({
      days: [{ day: today(), done: 1 }]
    })
  })

  it('refuses an unknown zone and a board the person cannot see', async () => {
    const owner = aUser()
    const { progress } = await aBoard(owner)

    expect((await progress(owner, 'Mars/Olympus')).statusCode).toBe(400)
    expect((await progress(aUser())).statusCode).toBe(404)
    expect(
      (await progress(aUser({ organizationId: owner.organizationId })))
        .statusCode
    ).toBe(404)
  })
})
