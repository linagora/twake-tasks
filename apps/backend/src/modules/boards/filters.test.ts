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
    id: board.id,
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
      criteria: { priority: [1], label: ['CLIENT'] }
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

    expect(await keysOf(owner, await save({ assignee: ['me'] }))).toEqual([
      'DES-1'
    ])
    expect(await keysOf(owner, await save({ assignee: ['nobody'] }))).toEqual([
      'DES-2',
      'DES-3'
    ])
    expect(await keysOf(owner, await save({ due: ['overdue'] }))).toEqual([
      'DES-2'
    ])
    expect(await keysOf(owner, await save({ due: ['today'] }))).toEqual([
      'DES-1'
    ])
    expect(await keysOf(owner, await save({ due: ['none'] }))).toEqual([
      'DES-3'
    ])
  })

  it('filters by the people picked, on the boards I can see only', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const design = (
      await api.as(alice).post('/boards', { name: 'DES', keyPrefix: 'DES' })
    ).json<{ id: string }>()
    await api.as(alice).post(`/boards/${design.id}/invites`, {
      email: bob.email,
      role: 'editor'
    })
    await api.as(bob).get('/boards')
    const path = `/boards/${design.id}/tasks`
    const add = async (title: string, userIds: string[]) => {
      const task = (
        await api.as(alice).post(path, { sectionId: null, title })
      ).json<{ id: string }>()
      await api.as(alice).put(`${path}/${task.id}/assignees`, { userIds })
    }
    await add('Bob’s', [bob.userId])
    await add('Mine', [alice.userId])
    await add('Ours', [alice.userId, bob.userId])
    await add('Nobody’s', [])
    const bobs = await aBoardOf(bob, 'BOB')
    const hidden = await bobs.add('Bob’s, hidden')
    await bobs.assign(hidden.id, bob)
    const keys = async (assignee: string[]) => {
      const { id } = (
        await api
          .as(alice)
          .post('/filters', { name: 'Some', criteria: { assignee } })
      ).json<{ id: string }>()
      return (await keysOf(alice, id)).sort()
    }

    expect(await keys([bob.userId])).toEqual(['DES-1', 'DES-3'])
    expect(await keys([bob.userId, 'nobody'])).toEqual([
      'DES-1',
      'DES-3',
      'DES-4'
    ])
  })

  it('matches any of several values for one criterion, and all criteria', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'DES')
    const client = await design.label('client')
    const internal = await design.label('internal')
    const mine = await design.add('P1, client', { priority: 1 }, [client])
    await design.add('P2, internal, today', { priority: 2, dueDate: today }, [
      internal
    ])
    await design.add(
      'P3, client, late',
      { priority: 3, dueDate: shift(today, -1, 'days') },
      [client]
    )
    await design.add('P2, unlabeled', { priority: 2 })
    await design.assign(mine.id, owner)
    const keys = async (criteria: object) => {
      const { id } = (
        await api.as(owner).post('/filters', { name: 'Some', criteria })
      ).json<{ id: string }>()
      return keysOf(owner, id)
    }

    expect(await keys({ priority: [1, 2] })).toEqual([
      'DES-2',
      'DES-1',
      'DES-4'
    ])
    expect(await keys({ label: ['Client', 'internal'] })).toEqual([
      'DES-3',
      'DES-2',
      'DES-1'
    ])
    expect(await keys({ due: ['overdue', 'today'] })).toEqual([
      'DES-3',
      'DES-2'
    ])
    expect(await keys({ assignee: ['me', 'nobody'] })).toHaveLength(4)
    expect(await keys({ priority: [2, 3], label: ['client'] })).toEqual([
      'DES-3'
    ])
  })

  it('keeps to the boards picked, and finds nothing on a board out of reach', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'DES')
    const home = await aBoardOf(owner, 'HOM')
    const support = await aBoardOf(owner, 'SUP')
    await design.add('Design, urgent', { priority: 1 })
    await design.add('Design, low', { priority: 4 })
    await home.add('Home, urgent', { priority: 1 })
    await support.add('Support, urgent', { priority: 1 })
    const elsewhere = await aBoardOf(aUser(), 'OTH')
    await elsewhere.add('Not mine', { priority: 1 })
    const keys = async (criteria: object) => {
      const { id } = (
        await api.as(owner).post('/filters', { name: 'Some', criteria })
      ).json<{ id: string }>()
      return keysOf(owner, id)
    }

    expect(await keys({ board: [design.id], priority: [1] })).toEqual(['DES-1'])
    expect((await keys({ board: [design.id, home.id] })).sort()).toEqual([
      'DES-1',
      'DES-2',
      'HOM-1'
    ])
    expect(await keys({ board: [elsewhere.id] })).toEqual([])
    expect(await keys({ board: [support.id] })).toEqual(['SUP-1'])

    expect(
      (await api.as(owner).post(`/boards/${support.id}/archive`, {})).statusCode
    ).toBe(204)

    expect(await keys({ board: [support.id] })).toEqual([])
    expect(
      (
        await api
          .as(owner)
          .post('/filters', { name: 'Odd', criteria: { board: ['support'] } })
      ).statusCode
    ).toBe(400)
  })

  it('keeps filters to the person who saved them, until deleted', async () => {
    const owner = aUser()
    const other = aUser({ organizationId: owner.organizationId })
    const { id } = (
      await api
        .as(owner)
        .post('/filters', { name: 'Urgent', criteria: { priority: [1] } })
    ).json<{ id: string }>()

    expect(
      (await api.as(owner).get('/filters')).json<{ filters: unknown[] }>()
    ).toEqual({
      filters: [
        { id, name: 'Urgent', criteria: { priority: [1] }, favorite: false }
      ]
    })
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

  it('tells the status kind of each task, to group them by', async () => {
    const owner = aUser()
    const board = (
      await api.as(owner).post('/boards', { name: 'DES', keyPrefix: 'DES' })
    ).json<{ id: string }>()
    const { sections } = (await api.as(owner).get(`/boards/${board.id}`)).json<{
      sections: { id: string; category: string }[]
    }>()
    const started = sections.find(section => section.category === 'started')
    await api.as(owner).post(`/boards/${board.id}/tasks`, {
      sectionId: started?.id,
      title: 'Doing'
    })
    await api
      .as(owner)
      .post(`/boards/${board.id}/tasks`, { sectionId: null, title: 'Loose' })
    const { id } = (
      await api.as(owner).post('/filters', { name: 'All', criteria: {} })
    ).json<{ id: string }>()

    const { tasks } = (
      await api.as(owner).get(`/filters/${id}/tasks?zone=${zone}`)
    ).json<{ tasks: { key: string; category: string | null }[] }>()

    expect(tasks.map(({ key, category }) => ({ key, category }))).toEqual([
      { key: 'DES-1', category: 'started' },
      { key: 'DES-2', category: null }
    ])
  })

  it('renames a filter and changes what it looks for, for its owner only', async () => {
    const owner = aUser()
    const other = aUser({ organizationId: owner.organizationId })
    const design = await aBoardOf(owner, 'DES')
    const client = await design.label('client')
    await design.add('Urgent, labeled', { priority: 1 }, [client])
    await design.add('Low, labeled', { priority: 4 }, [client])
    const { id } = (
      await api
        .as(owner)
        .post('/filters', { name: 'Clint', criteria: { label: ['client'] } })
    ).json<{ id: string }>()

    const renamed = await api.as(owner).patch(`/filters/${id}`, {
      name: 'Client fires',
      criteria: { label: ['client'], priority: [1] }
    })

    expect(renamed.statusCode).toBe(204)
    expect(
      (await api.as(owner).get('/filters')).json<{ filters: unknown[] }>()
    ).toEqual({
      filters: [
        {
          id,
          name: 'Client fires',
          criteria: { label: ['client'], priority: [1] },
          favorite: false
        }
      ]
    })
    expect(await keysOf(owner, id)).toEqual(['DES-1'])
    expect(
      (await api.as(owner).patch(`/filters/${id}`, { name: 'Clients' }))
        .statusCode
    ).toBe(204)
    expect(
      (await api.as(owner).get('/filters')).json<{ filters: unknown[] }>()
    ).toEqual({
      filters: [
        {
          id,
          name: 'Clients',
          criteria: { label: ['client'], priority: [1] },
          favorite: false
        }
      ]
    })
    expect(
      (await api.as(other).patch(`/filters/${id}`, { name: 'Mine now' }))
        .statusCode
    ).toBe(404)
    expect(
      (await api.as(owner).patch(`/filters/${id}`, { name: ' ' })).statusCode
    ).toBe(400)
    expect((await api.as(owner).patch(`/filters/${id}`, {})).statusCode).toBe(
      400
    )
  })

  it('stars a filter as a favorite, for its owner only, until unstarred', async () => {
    const owner = aUser()
    const other = aUser({ organizationId: owner.organizationId })
    const { id } = (
      await api
        .as(owner)
        .post('/filters', { name: 'Urgent', criteria: { priority: [1] } })
    ).json<{ id: string }>()
    const favorite = async () =>
      (await api.as(owner).get('/filters'))
        .json<{ filters: { favorite: boolean }[] }>()
        .filters.map(filter => filter.favorite)

    expect(await favorite()).toEqual([false])
    expect(
      (await api.as(owner).put(`/filters/${id}/favorite`)).statusCode
    ).toBe(204)
    expect(
      (await api.as(owner).put(`/filters/${id}/favorite`)).statusCode
    ).toBe(204)
    expect(await favorite()).toEqual([true])
    expect(
      (await api.as(other).put(`/filters/${id}/favorite`)).statusCode
    ).toBe(404)
    expect(
      (await api.as(owner).delete(`/filters/${id}/favorite`)).statusCode
    ).toBe(204)
    expect(await favorite()).toEqual([false])
    expect(
      (await api.as(owner).put('/filters/not-a-uuid/favorite')).statusCode
    ).toBe(404)
  })

  it('refuses unknown criteria, and a criterion with no values', async () => {
    const user = aUser()
    for (const criteria of [
      { colour: ['red'] },
      { priority: [] },
      { priority: 1 },
      { due: ['soon'] },
      { assignee: ['someone'] }
    ]) {
      const response = await api
        .as(user)
        .post('/filters', { name: 'Odd', criteria })

      expect(response.statusCode).toBe(400)
    }
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

  it('lists the other people on my boards to filter by, once each', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId, name: 'Bob' })
    for (const keyPrefix of ['DES', 'HOM']) {
      const board = (
        await api.as(alice).post('/boards', { name: keyPrefix, keyPrefix })
      ).json<{ id: string }>()
      await api.as(alice).post(`/boards/${board.id}/invites`, {
        email: bob.email,
        role: 'viewer'
      })
    }
    await api.as(bob).get('/boards')
    await aBoardOf(aUser({ organizationId: alice.organizationId }), 'OTH')

    const response = await api.as(alice).get('/people')

    expect(response.json()).toEqual({
      people: [
        { userId: bob.userId, email: bob.email, name: 'Bob', avatar: null }
      ]
    })
  })

  it('names the parent of a sub-task', async () => {
    const owner = aUser()
    const board = (
      await api.as(owner).post('/boards', { name: 'Design', keyPrefix: 'DES' })
    ).json<{ id: string; sections: { id: string; category: string }[] }>()
    const started = board.sections.find(each => each.category === 'started')
    const path = `/boards/${board.id}/tasks`
    const parent = (
      await api
        .as(owner)
        .post(path, { sectionId: started?.id, title: 'Parent task' })
    ).json<{ id: string }>()
    await api.as(owner).post(path, { parentId: parent.id, title: 'Step 1' })
    const { id } = (
      await api.as(owner).post('/filters', { name: 'All', criteria: {} })
    ).json<{ id: string }>()

    const { tasks } = (
      await api.as(owner).get(`/filters/${id}/tasks?zone=${zone}`)
    ).json<{
      tasks: {
        title: string
        category: string | null
        parentTitle: string | null
      }[]
    }>()

    expect(tasks).toEqual([
      expect.objectContaining({
        title: 'Parent task',
        category: 'started',
        parentTitle: null
      }),
      expect.objectContaining({
        title: 'Step 1',
        category: null,
        parentTitle: 'Parent task'
      })
    ])
  })
})
