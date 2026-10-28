import { boardResponse } from '@twake-tasks/api-contract'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aUser, startApp } from '../../testing/app.ts'

let api: Awaited<ReturnType<typeof startApp>>

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

    const board = await api.as(alice).get(`/boards/${boardId}`)

    const parsed = boardResponse.safeParse(board.json())
    expect(parsed.error).toBeUndefined()
    expect(parsed.data?.tasks).toMatchObject([
      {
        priority: 2,
        dueTime: '09:30',
        assignees: [{ userId: alice.userId }],
        labels: [{ name: 'Brand' }],
        commentCount: 1
      }
    ])
    expect(parsed.data?.tasks[0]?.canceledAt).not.toBeNull()
  })
})
