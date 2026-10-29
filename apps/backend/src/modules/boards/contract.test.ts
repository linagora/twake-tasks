import {
  agendaResponse,
  boardResponse,
  boardsResponse,
  commentsResponse,
  createdFilterResponse,
  createdTaskResponse,
  descriptionResponse,
  descriptionVersionResponse,
  filtersResponse,
  followingResponse,
  hiddenTasksResponse,
  historyResponse,
  keyPrefixResponse,
  label,
  labelNamesResponse,
  notificationsResponse,
  peopleResponse,
  projectsResponse,
  remindersResponse,
  searchResponse,
  section,
  settingsResponse,
  sharingResponse,
  tasksResponse,
  transferPreviewResponse,
  transferResponse,
  unreadResponse
} from '@twake-tasks/api-contract'
import type { LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { aUser, startApp } from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>

const parsedGets = new Set<string>()

function contracted<S extends z.ZodType>(
  schema: S,
  response: LightMyRequestResponse
): z.output<S> {
  expect(response.statusCode).toBeLessThan(300)
  const result = schema.safeParse(response.json())
  if (!result.success) throw result.error
  const { method, url = '' } = response.raw.req
  if (method === 'GET') parsedGets.add(url.split('?')[0] ?? url)
  return result.data
}

// One line of the tree per segment, four columns deeper per level.
function getRoutes(tree: string) {
  const prefixes: string[] = []
  return tree.split('\n').flatMap(line => {
    const at = line.search(/[├└]── /)
    if (at < 0) return []
    const [segment = '', methods] = line.slice(at + 4).split(' (')
    prefixes.length = at / 4
    prefixes.push(segment)
    return methods?.includes('GET') ? [prefixes.join('')] : []
  })
}

// Server-sent events, not JSON.
const NOT_JSON = new Set(['/api/boards/:boardId/events'])

beforeAll(async () => {
  api = await startApp()
})

afterAll(async () => {
  await api.close()
})

describe('the API contract', () => {
  it('describes a new board and a board whose task has every field set', async () => {
    const alice = aUser()
    const created = await api
      .as(alice)
      .post('/boards', { name: 'Design', keyPrefix: 'DES' })
    expect(boardResponse.safeParse(created.json()).error).toBeUndefined()
    const boardId = created.json<{ id: string }>().id
    const task = await api
      .as(alice)
      .post(`/boards/${boardId}/tasks`, { sectionId: null, title: 'Brief' })
    const at = `/boards/${boardId}/tasks/${task.json<{ id: string }>().id}`
    const label = await api
      .as(alice)
      .post(`/boards/${boardId}/labels`, { name: 'Brand', color: '#336699' })
    await api.as(alice).patch(at, {
      priority: 2,
      dueDate: '2026-10-28',
      dueTime: '09:30',
      dueZone: 'Europe/Paris',
      deadline: '2026-10-30',
      duration: { amount: 30, unit: 'minutes' },
      recurrence: { every: 1, unit: 'weeks', fromCompletion: false }
    })
    await api.as(alice).put(`${at}/assignees`, { userIds: [alice.userId] })
    await api
      .as(alice)
      .put(`${at}/labels`, { labelIds: [label.json<{ id: string }>().id] })
    await api.as(alice).post(`${at}/comments`, { body: 'Looks good' })
    await api.as(alice).post(`${at}/complete`, { state: 'canceled' })

    const board = contracted(
      boardResponse,
      await api.as(alice).get(`/boards/${boardId}`)
    )

    expect(board.tasks).toMatchObject([
      {
        priority: 2,
        dueTime: '09:30',
        assignees: [{ userId: alice.userId }],
        labels: [{ name: 'Brand' }],
        commentCount: 1
      }
    ])
    expect(board.tasks[0]?.canceledAt).not.toBeNull()
  })

  it('describes every other response the app reads', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const carol = aUser({ organizationId: alice.organizationId })
    const { id: boardId } = contracted(
      boardResponse,
      await api.as(alice).post('/boards', { name: 'Design', keyPrefix: 'DES' })
    )
    const { id: opsId } = contracted(
      boardResponse,
      await api.as(alice).post('/boards', { name: 'Ops', keyPrefix: 'OPS' })
    )
    const board = `/boards/${boardId}`
    const newTask = async (title: string) =>
      contracted(
        createdTaskResponse,
        await api.as(alice).post(`${board}/tasks`, { sectionId: null, title })
      ).id

    const taskId = await newTask('Brief')
    const at = `${board}/tasks/${taskId}`
    contracted(
      section,
      await api
        .as(alice)
        .post(`${board}/sections`, { name: 'Review', category: 'started' })
    )
    const { id: labelId } = contracted(
      label,
      await api.as(alice).post(`${board}/labels`, { name: 'Brand' })
    )
    contracted(
      label,
      await api
        .as(alice)
        .patch(`${board}/labels/${labelId}`, { color: '#336699' })
    )
    await api.as(alice).put(`${at}/labels`, { labelIds: [labelId] })
    await api.as(alice).patch(at, { dueDate: '2020-01-02', dueTime: '09:30' })
    expect(
      contracted(
        descriptionVersionResponse,
        await api.as(alice).put(`${at}/description`, {
          markdown: 'Plan the roadmap',
          version: 0
        })
      )
    ).toEqual({ version: 1 })
    contracted(
      descriptionResponse,
      await api.as(alice).get(`${at}/description`)
    )

    await api
      .as(alice)
      .post(`${board}/invites`, { email: bob.email, role: 'editor' })
    contracted(sharingResponse, await api.as(alice).get(`${board}/sharing`))
    expect(
      contracted(boardsResponse, await api.as(bob).get('/boards')).boards
    ).toContainEqual(
      expect.objectContaining({ sharedBy: { name: null, email: alice.email } })
    )
    await api.as(carol).get('/boards')
    expect(
      contracted(
        peopleResponse,
        await api
          .as(alice)
          .get(`${board}/sharing/people?q=${carol.userId.slice(0, 8)}`)
      ).people
    ).toHaveLength(1)
    expect(
      contracted(peopleResponse, await api.as(alice).get('/people')).people
    ).toHaveLength(1)
    await api
      .as(alice)
      .put(`${at}/assignees`, { userIds: [alice.userId, bob.userId] })

    await api.as(alice).post(`${at}/comments`, { body: 'Looks good' })
    const [comment] = contracted(
      commentsResponse,
      await api.as(alice).get(`${at}/comments`)
    ).comments
    await api
      .as(bob)
      .put(
        `${at}/comments/${comment?.id ?? ''}/reactions/${encodeURIComponent('👍')}`
      )
    expect(
      contracted(commentsResponse, await api.as(alice).get(`${at}/comments`))
        .comments[0]?.reactions
    ).toMatchObject([{ emoji: '👍', people: [{ userId: bob.userId }] }])

    await api
      .as(alice)
      .post(`${at}/reminders`, { at: '2099-01-01T09:00:00.000Z' })
    await api
      .as(alice)
      .post(`${at}/reminders`, { beforeMinutes: 30, zone: 'Europe/Paris' })
    expect(
      contracted(remindersResponse, await api.as(alice).get(`${at}/reminders`))
        .reminders
    ).toHaveLength(2)
    contracted(followingResponse, await api.as(alice).get(`${at}/follow`))
    expect(
      contracted(historyResponse, await api.as(alice).get(`${at}/history`))
        .entries.length
    ).toBeGreaterThan(0)

    expect(
      contracted(notificationsResponse, await api.as(bob).get('/notifications'))
        .notifications
    ).toMatchObject([
      { reason: 'following', commentExcerpt: 'Looks good' },
      { reason: 'assigned', change: { field: 'assignees' } }
    ])
    expect(
      contracted(unreadResponse, await api.as(bob).get('/notifications/unread'))
        .projects
    ).toHaveLength(1)

    const { id: filterId } = contracted(
      createdFilterResponse,
      await api.as(alice).post('/filters', {
        name: 'Mine',
        criteria: { assignee: ['me'], due: ['overdue'] }
      })
    )
    contracted(filtersResponse, await api.as(alice).get('/filters'))
    contracted(labelNamesResponse, await api.as(alice).get('/labels'))
    for (const path of [
      `/filters/${filterId}/tasks?zone=Europe/Paris`,
      '/my-tasks'
    ]) {
      expect(
        contracted(tasksResponse, await api.as(alice).get(path)).tasks
      ).toHaveLength(1)
    }
    expect(
      contracted(
        agendaResponse,
        await api.as(alice).get('/agenda?zone=Europe/Paris&days=7')
      ).tasks
    ).toHaveLength(1)
    expect(
      contracted(searchResponse, await api.as(alice).get('/search?q=roadmap'))
        .tasks
    ).toMatchObject([{ excerpt: 'Plan the roadmap' }])
    expect(
      contracted(
        keyPrefixResponse,
        await api.as(alice).get('/key-prefixes/OPS')
      )
    ).toEqual({ available: false, suggestion: 'OPS2' })

    const target = { boardId: opsId, sectionId: null }
    expect(
      contracted(
        transferPreviewResponse,
        await api.as(alice).post(`${at}/transfer/preview`, target)
      )
    ).toMatchObject({
      droppedAssignees: [{ userId: bob.userId }],
      createdLabels: ['Brand']
    })
    const moved = await newTask('Move me')
    contracted(
      transferResponse,
      await api.as(alice).post(`${board}/tasks/${moved}/transfer`, target)
    )
    const archived = await newTask('Old')
    await api.as(alice).post(`${board}/tasks/${archived}/archive`, {})
    const trashed = await newTask('Gone')
    await api.as(alice).delete(`${board}/tasks/${trashed}`)
    for (const shelf of ['archived', 'trash']) {
      expect(
        contracted(
          hiddenTasksResponse,
          await api.as(alice).get(`${board}/${shelf}`)
        ).tasks
      ).toHaveLength(1)
    }

    contracted(projectsResponse, await api.as(alice).get('/projects'))
    contracted(settingsResponse, await api.as(alice).get('/settings'))
  })

  // Runs last: it checks what the tests above parsed.
  it('parses a response of every GET route of the API', () => {
    const routes = getRoutes(
      api.printRoutes({ commonPrefix: false, method: 'GET' })
    )
    const served = (route: string, path: string) => {
      const [want, got] = [route.split('/'), path.split('/')]
      return (
        want.length === got.length &&
        want.every(
          (segment, i) => segment.startsWith(':') || segment === got[i]
        )
      )
    }
    const unparsed = routes.filter(
      route =>
        route.startsWith('/api/') &&
        !NOT_JSON.has(route) &&
        ![...parsedGets].some(path => served(route, path))
    )

    expect(routes).toContain('/api/boards/:boardId')
    expect(unparsed).toEqual([])
  })
})
