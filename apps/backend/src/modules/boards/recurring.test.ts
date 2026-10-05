import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
})

interface Section {
  id: string
  category: string
}

async function aTaskOf(owner: TestUser, sectioned: boolean) {
  const board = (
    await api.as(owner).post('/boards', { name: 'Home', keyPrefix: 'HOM' })
  ).json<{ id: string; sections: Section[] }>()
  const task = (
    await api.as(owner).post(`/boards/${board.id}/tasks`, {
      sectionId: sectioned ? board.sections[0]?.id : null,
      title: 'Water the plants'
    })
  ).json<{ id: string }>()
  const path = `/boards/${board.id}/tasks/${task.id}`
  return {
    edit: (body: object) => api.as(owner).patch(path, body),
    complete: () =>
      api.as(owner).post(`${path}/complete`, { state: 'completed' }),
    moveTo: (category: string) =>
      api.as(owner).post(`${path}/move`, {
        sectionId: board.sections.find(section => section.category === category)
          ?.id
      }),
    read: async () =>
      (await api.as(owner).get(`/boards/${board.id}`)).json<{
        tasks: Record<string, unknown>[]
      }>().tasks[0],
    history: async () =>
      (await api.as(owner).get(`${path}/history`)).json<{
        entries: { field: string; to: unknown }[]
      }>().entries
  }
}

const today = () => new Date().toISOString().slice(0, 10)

describe('recurring tasks', () => {
  it('moves the due date to the next occurrence when completed', async () => {
    const { edit, complete, read, history } = await aTaskOf(aUser(), false)

    await edit({
      dueDate: '2099-01-31',
      recurrence: { every: 1, unit: 'months', fromCompletion: false }
    })
    expect((await complete()).statusCode).toBe(204)

    expect(await read()).toMatchObject({
      dueDate: '2099-02-28',
      completedAt: null,
      recurrence: { every: 1, unit: 'months', fromCompletion: false }
    })
    expect((await complete()).statusCode).toBe(204)
    expect(await read()).toMatchObject({ dueDate: '2099-03-28' })
    expect(
      (await history()).filter(entry => entry.field === 'completion')
    ).toHaveLength(2)
  })

  it('skips past occurrences of an overdue task', async () => {
    const { edit, complete, read } = await aTaskOf(aUser(), false)

    await edit({
      dueDate: '2000-01-01',
      recurrence: { every: 1, unit: 'days', fromCompletion: false }
    })
    await complete()

    const { dueDate } = (await read()) as { dueDate: string }
    expect(dueDate > today()).toBe(true)
  })

  it('repeats from the completion date', async () => {
    const { edit, complete, read } = await aTaskOf(aUser(), false)

    await edit({
      dueDate: '2099-06-01',
      recurrence: { every: 3, unit: 'days', fromCompletion: true }
    })
    await complete()

    const expected = new Date(`${today()}T00:00:00Z`)
    expected.setUTCDate(expected.getUTCDate() + 3)
    expect(await read()).toMatchObject({
      dueDate: expected.toISOString().slice(0, 10)
    })
  })

  it('stays in its section when moved to a completed one', async () => {
    const { edit, moveTo, read } = await aTaskOf(aUser(), true)
    const before = (await read()) as { sectionId: string }

    await edit({
      dueDate: '2099-01-05',
      recurrence: { every: 2, unit: 'weeks', fromCompletion: false }
    })
    expect((await moveTo('completed')).statusCode).toBe(204)

    expect(await read()).toMatchObject({
      sectionId: before.sectionId,
      dueDate: '2099-01-19',
      completedAt: null
    })
  })

  it('needs a due date, and loses its rule with it', async () => {
    const { edit, read } = await aTaskOf(aUser(), false)
    const rule = { every: 1, unit: 'weeks', fromCompletion: false }

    expect((await edit({ recurrence: rule })).json()).toEqual({
      error: 'invalid_dates'
    })
    await edit({ dueDate: '2099-01-05', recurrence: rule })
    await edit({ dueDate: null })

    expect(await read()).toMatchObject({ recurrence: null })
  })
})
