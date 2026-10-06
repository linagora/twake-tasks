import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aUser, startApp, type TestUser } from '../../testing/app.ts'
import { shift, todayIn } from './recurrence.ts'

let api: Awaited<ReturnType<typeof startApp>>

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
})

const zone = 'Europe/Paris'
const today = todayIn(zone)

async function aBoardOf(owner: TestUser, keyPrefix: string) {
  const board = (
    await api.as(owner).post('/boards', { name: keyPrefix, keyPrefix })
  ).json<{ id: string }>()
  const path = `/boards/${board.id}`
  return {
    label: async (name: string) =>
      (await api.as(owner).post(`${path}/labels`, { name })).json<{
        id: string
      }>().id,
    add: async (
      title: string,
      changes: object = {},
      labelIds: string[] = []
    ) => {
      const task = (
        await api.as(owner).post(`${path}/tasks`, { sectionId: null, title })
      ).json<{ id: string }>()
      if (Object.keys(changes).length > 0) {
        await api.as(owner).patch(`${path}/tasks/${task.id}`, changes)
      }
      if (labelIds.length > 0) {
        await api.as(owner).put(`${path}/tasks/${task.id}/labels`, { labelIds })
      }
      return task
    },
    assign: (taskId: string, user: TestUser) =>
      api.as(owner).put(`${path}/tasks/${taskId}/assignees`, {
        userIds: [user.userId]
      })
  }
}

const keysOf = async (user: TestUser, filterId: string) =>
  (await api.as(user).get(`/filters/${filterId}/tasks?zone=${zone}`))
    .json<{ tasks: { key: string }[] }>()
    .tasks.map(task => task.key)

describe('saved filters', () => {
  it('finds the matching open tasks across my boards', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'DES')
    const home = await aBoardOf(owner, 'HOM')
    const client = await design.label('client')
    const homeClient = await home.label('Client')
    await design.add('Urgent, labeled', { priority: 1 }, [client])
    await design.add('Urgent, no label', { priority: 1 })
    await home.add('Labeled, low', { priority: 4 }, [homeClient])
    await home.add(
      'Urgent, labeled, late',
      { priority: 1, dueDate: shift(today, 10, 'days') },
      [homeClient]
    )

    const created = await api.as(owner).post('/filters', {
      name: 'Client fires',
      criteria: { priority: 1, label: 'CLIENT' }
    })
    const { id } = created.json<{ id: string }>()

    expect(created.statusCode).toBe(201)
    expect(await keysOf(owner, id)).toEqual(['HOM-2', 'DES-1'])
  })

  it('filters by assignee and by due date', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'DES')
    const mine = await design.add('Mine', { dueDate: today })
    await design.add('Nobody’s', { dueDate: shift(today, -1, 'days') })
    await design.add('Undated')
    await design.assign(mine.id, owner)
    const save = async (criteria: object) =>
      (await api.as(owner).post('/filters', { name: 'Some', criteria })).json<{
        id: string
      }>().id

    expect(await keysOf(owner, await save({ assignee: 'me' }))).toEqual([
      'DES-1'
    ])
    expect(await keysOf(owner, await save({ assignee: 'nobody' }))).toEqual([
      'DES-2',
      'DES-3'
    ])
    expect(await keysOf(owner, await save({ due: 'overdue' }))).toEqual([
      'DES-2'
    ])
    expect(await keysOf(owner, await save({ due: 'today' }))).toEqual(['DES-1'])
    expect(await keysOf(owner, await save({ due: 'none' }))).toEqual(['DES-3'])
  })

  it('keeps filters to the person who saved them, until deleted', async () => {
    const owner = aUser()
    const other = aUser({ organizationId: owner.organizationId })
    const { id } = (
      await api
        .as(owner)
        .post('/filters', { name: 'Urgent', criteria: { priority: 1 } })
    ).json<{ id: string }>()

    expect(
      (await api.as(owner).get('/filters')).json<{ filters: unknown[] }>()
    ).toEqual({ filters: [{ id, name: 'Urgent', criteria: { priority: 1 } }] })
    expect(
      (await api.as(other).get('/filters')).json<{ filters: unknown[] }>()
        .filters
    ).toEqual([])
    expect(
      (await api.as(other).get(`/filters/${id}/tasks?zone=UTC`)).statusCode
    ).toBe(404)

    expect((await api.as(owner).delete(`/filters/${id}`)).statusCode).toBe(204)
    expect(
      (await api.as(owner).get('/filters')).json<{ filters: unknown[] }>()
        .filters
    ).toEqual([])
  })

  it('refuses unknown criteria', async () => {
    const response = await api
      .as(aUser())
      .post('/filters', { name: 'Odd', criteria: { colour: 'red' } })

    expect(response.statusCode).toBe(400)
  })

  it('lists the label names on my boards to filter by', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'DES')
    const home = await aBoardOf(owner, 'HOM')
    await design.label('urgent')
    await design.label('client')
    await home.label('Client')
    await (await aBoardOf(aUser(), 'OTH')).label('secret')

    const response = await api.as(owner).get('/labels')

    expect(response.json()).toEqual({ labels: ['client', 'urgent'] })
  })
})
