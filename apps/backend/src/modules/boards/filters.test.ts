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
    label: async (name: string, color?: string) =>
      (await api.as(owner).post(`${path}/labels`, { name, color })).json<{
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
  it('finds the matching tasks across my boards', async () => {
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
    ).toEqual({
      filters: [
        {
          id,
          name: 'Urgent',
          criteria: { priorities: [1] },
          favorite: false,
          icon: null,
          layout: 'list',
          groupBy: 'status',
          allColumns: false
        }
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

  it('lists my favorite filters first', async () => {
    const owner = aUser()
    const other = aUser({ organizationId: owner.organizationId })
    const save = async (name: string) =>
      (await api.as(owner).post('/filters', { name, criteria: {} })).json<{
        id: string
      }>().id
    const names = async () =>
      (await api.as(owner).get('/filters'))
        .json<{ filters: { name: string; favorite: boolean }[] }>()
        .filters.map(filter => `${filter.name}${filter.favorite ? '*' : ''}`)
    await save('Alpha')
    const beta = await save('Beta')

    expect(
      (await api.as(owner).put(`/filters/${beta}/favorite`)).statusCode
    ).toBe(204)
    expect(await names()).toEqual(['Beta*', 'Alpha'])
    expect(
      (await api.as(other).put(`/filters/${beta}/favorite`)).statusCode
    ).toBe(404)

    expect(
      (await api.as(owner).delete(`/filters/${beta}/favorite`)).statusCode
    ).toBe(204)
    expect(await names()).toEqual(['Alpha', 'Beta'])
  })

  it('keeps the icon of a view, and only an icon name', async () => {
    const owner = aUser()
    const save = (icon: unknown) =>
      api.as(owner).post('/filters', { name: 'Bugs', criteria: {}, icon })

    expect((await save('BugReport')).statusCode).toBe(201)
    expect((await save(null)).statusCode).toBe(201)
    expect((await save('<svg>')).statusCode).toBe(400)
    expect((await save('🐛')).statusCode).toBe(400)
    expect(
      (await api.as(owner).get('/filters'))
        .json<{ filters: { icon: string | null }[] }>()
        .filters.map(filter => filter.icon)
    ).toEqual(['BugReport', null])
  })

  it('creates a view in the layout chosen, a list unless said', async () => {
    const owner = aUser()
    const layouts = async () =>
      (await api.as(owner).get('/filters'))
        .json<{ filters: { name: string; layout: string }[] }>()
        .filters.map(filter => `${filter.name}:${filter.layout}`)
    await api.as(owner).post('/filters', { name: 'A', criteria: {} })
    await api
      .as(owner)
      .post('/filters', { name: 'B', criteria: {}, layout: 'calendar' })

    expect(await layouts()).toEqual(['A:list', 'B:calendar'])
    expect(
      (
        await api
          .as(owner)
          .post('/filters', { name: 'C', criteria: {}, layout: 'grid' })
      ).statusCode
    ).toBe(400)
  })

  it('groups a view by the criterion chosen, its statuses unless said', async () => {
    const owner = aUser()
    const groupings = async () =>
      (await api.as(owner).get('/filters'))
        .json<{ filters: { name: string; groupBy: string }[] }>()
        .filters.map(filter => `${filter.name}:${filter.groupBy}`)
    await api.as(owner).post('/filters', { name: 'A', criteria: {} })
    await api
      .as(owner)
      .post('/filters', { name: 'B', criteria: {}, groupBy: 'label' })

    expect(await groupings()).toEqual(['A:status', 'B:label'])
    expect(
      (
        await api
          .as(owner)
          .post('/filters', { name: 'C', criteria: {}, groupBy: 'colour' })
      ).statusCode
    ).toBe(400)
  })

  it('edits a view, for the person who saved it only', async () => {
    const owner = aUser()
    const other = aUser({ organizationId: owner.organizationId })
    const { id } = (
      await api.as(owner).post('/filters', { name: 'Mine', criteria: {} })
    ).json<{ id: string }>()
    const edit = {
      name: 'Urgent',
      criteria: { priorities: [1] },
      icon: 'Flag',
      layout: 'board',
      groupBy: 'priority',
      allColumns: true
    }

    expect((await api.as(other).put(`/filters/${id}`, edit)).statusCode).toBe(
      404
    )
    expect((await api.as(owner).put(`/filters/${id}`, edit)).statusCode).toBe(
      204
    )
    expect(
      (await api.as(owner).get('/filters')).json<{ filters: unknown[] }>()
        .filters
    ).toEqual([{ id, favorite: false, ...edit }])
    expect(
      (await api.as(owner).put(`/filters/${id}`, { name: '' })).statusCode
    ).toBe(400)
  })

  it('filters by board', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'DSB')
    const home = await aBoardOf(owner, 'HMB')
    await design.add('Logo')
    await home.add('Paint')
    const { id } = (
      await api.as(owner).post('/filters', {
        name: 'Design',
        criteria: { board: design.id }
      })
    ).json<{ id: string }>()

    expect(await keysOf(owner, id)).toEqual(['DSB-1'])
  })

  it('matches a task with any of the values of a criterion, and every criterion', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'ORA')
    const home = await aBoardOf(owner, 'ORB')
    const client = await design.label('client')
    const web = await design.label('web')
    const print = await design.label('print')
    await design.add('Client, urgent', { priority: 1 }, [client])
    await design.add('Web, high', { priority: 2 }, [web])
    await design.add('Print, urgent', { priority: 1 }, [print])
    await design.add('Client, low', { priority: 4 }, [client])
    await home.add('No label, urgent', { priority: 1 })
    const save = async (criteria: object) =>
      (await api.as(owner).post('/filters', { name: 'Some', criteria })).json<{
        id: string
      }>().id

    expect(
      await keysOf(
        owner,
        await save({ labels: ['CLIENT', 'web'], priorities: [1, 2] })
      )
    ).toEqual(['ORA-1', 'ORA-2'])
    expect(
      await keysOf(owner, await save({ boards: [design.id, home.id] }))
    ).toHaveLength(5)
    expect(
      await keysOf(owner, await save({ dues: ['today', 'none'] }))
    ).toHaveLength(5)
  })

  it('keeps to any of the people chosen, me, or nobody', async () => {
    const owner = aUser()
    const colleague = aUser({ organizationId: owner.organizationId })
    const design = await aBoardOf(owner, 'PPL')
    await api.as(owner).post(`/boards/${design.id}/invites`, {
      email: colleague.email,
      role: 'editor'
    })
    await api.as(colleague).get('/boards')
    const mine = await design.add('Mine')
    const theirs = await design.add('Theirs')
    await design.add('Nobody’s')
    await design.assign(mine.id, owner)
    await design.assign(theirs.id, colleague)
    const save = async (criteria: object) =>
      (await api.as(owner).post('/filters', { name: 'Some', criteria })).json<{
        id: string
      }>().id

    expect(
      await keysOf(owner, await save({ assignees: [colleague.userId] }))
    ).toEqual(['PPL-2'])
    expect(
      await keysOf(owner, await save({ assignees: ['me', 'nobody'] }))
    ).toEqual(['PPL-1', 'PPL-3'])
    expect(
      (await api.as(owner).get('/people')).json<{ people: unknown[] }>()
    ).toEqual({
      people: [
        {
          userId: colleague.userId,
          email: colleague.email,
          name: null,
          avatar: null
        }
      ]
    })
  })

  it('keeps to sections by name, in any board and any case', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'STA')
    const home = await aBoardOf(owner, 'STB')
    const sectionsOf = async (boardId: string) =>
      (await api.as(owner).get(`/boards/${boardId}`)).json<{
        sections: { id: string; name: string }[]
      }>().sections
    const [designToDo, designDoing] = await sectionsOf(design.id)
    const [homeToDo] = await sectionsOf(home.id)
    const place = (boardId: string, title: string, sectionId: string) =>
      api.as(owner).post(`/boards/${boardId}/tasks`, { sectionId, title })
    await place(design.id, 'Logo', designToDo?.id ?? '')
    await place(design.id, 'Poster', designDoing?.id ?? '')
    await place(home.id, 'Paint', homeToDo?.id ?? '')
    const { id } = (
      await api.as(owner).post('/filters', {
        name: 'To do',
        criteria: { statuses: [designToDo?.name.toUpperCase() ?? ''] }
      })
    ).json<{ id: string }>()

    expect(await keysOf(owner, id)).toEqual(['STA-1', 'STB-1'])
    expect(
      (await api.as(owner).get('/statuses')).json<{ statuses: string[] }>()
        .statuses
    ).toEqual(expect.arrayContaining([designToDo?.name, designDoing?.name]))
  })

  it('keeps the done tasks that match, in their section', async () => {
    const owner = aUser()
    const board = await aBoardOf(owner, 'DON')
    const client = await board.label('client')
    const { sections } = (await api.as(owner).get(`/boards/${board.id}`)).json<{
      sections: { id: string; name: string; category: string }[]
    }>()
    const done = sections.find(each => each.category === 'completed')
    await board.add('Open', {}, [client])
    const finished = await board.add('Finished', {}, [client])
    await api.as(owner).post(`/boards/${board.id}/tasks/${finished.id}/move`, {
      sectionId: done?.id
    })
    const view = async (criteria: object) =>
      (
        await api.as(owner).post('/filters', { name: 'Client', criteria })
      ).json<{ id: string }>().id

    expect(await keysOf(owner, await view({ labels: ['client'] }))).toEqual([
      'DON-1',
      'DON-2'
    ])
    expect(
      await keysOf(owner, await view({ statuses: [done?.name ?? ''] }))
    ).toEqual(['DON-2'])
  })

  it('gives the criteria of views saved with one value each as lists', async () => {
    const owner = aUser()
    await api.as(owner).post('/filters', {
      name: 'Old',
      criteria: { priority: 1, label: 'client' }
    })

    const { filters } = (await api.as(owner).get('/filters')).json<{
      filters: { criteria: object }[]
    }>()

    expect(filters[0]?.criteria).toEqual({
      priorities: [1],
      labels: ['client']
    })
  })

  it('refuses unknown criteria', async () => {
    const response = await api
      .as(aUser())
      .post('/filters', { name: 'Odd', criteria: { colour: 'red' } })

    expect(response.statusCode).toBe(400)
  })

  it('lists the labels on my boards to filter by, in their colours', async () => {
    const owner = aUser()
    const design = await aBoardOf(owner, 'DES')
    const home = await aBoardOf(owner, 'HOM')
    await design.label('urgent')
    await design.label('client')
    await home.label('Client')
    await design.label('bug', '#e53935')
    await home.label('bug')
    await (await aBoardOf(aUser(), 'OTH')).label('secret')

    const response = await api.as(owner).get('/labels')

    expect(response.json()).toEqual({
      labels: [
        { name: 'bug', color: '#E53935' },
        { name: 'client', color: null },
        { name: 'urgent', color: null }
      ]
    })
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
          criteria: { labels: ['client'], priorities: [1] },
          favorite: false,
          icon: null,
          layout: 'list',
          groupBy: 'status',
          allColumns: false
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
          criteria: { labels: ['client'], priorities: [1] },
          favorite: false,
          icon: null,
          layout: 'list',
          groupBy: 'status',
          allColumns: false
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

  it('refuses a criterion of the earlier names with no values, or values unknown', async () => {
    const user = aUser()
    for (const criteria of [
      { colour: ['red'] },
      { priority: [] },
      { due: ['soon'] },
      { assignee: ['someone'] }
    ]) {
      const response = await api
        .as(user)
        .post('/filters', { name: 'Odd', criteria })

      expect(response.statusCode).toBe(400)
    }
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
