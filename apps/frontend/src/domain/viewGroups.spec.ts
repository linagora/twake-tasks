import { describe, expect, it } from 'vitest'

import { viewGroups, type ViewGroup } from '@/domain/viewGroups'
import { aTask } from '@/testing/fakeBoardsApi'

const lea = { userId: 'lea', email: 'lea@example.com', name: 'Léa' }
const tom = { userId: 'tom', email: 'tom@example.com', name: 'Tom' }

const task = (key: string, overrides: Parameters<typeof aTask>[1] = {}) => ({
  ...aTask(null, { key, ...overrides }),
  boardId: 'design',
  boardName: 'Design'
})

const keysBy = (groups: ViewGroup<ReturnType<typeof task>>[]) =>
  groups.map(
    group => `${group.key}=${group.tasks.map(each => each.key).join(',')}`
  )

describe('viewGroups', () => {
  it('puts a task of many people or labels in the group of each, none last', () => {
    const tasks = [
      task('A', {
        assignees: [tom, lea],
        labels: [{ id: '1', name: 'Client', color: null }]
      }),
      task('B', {
        labels: [
          { id: '2', name: 'client', color: null },
          { id: '3', name: 'bug', color: null }
        ]
      }),
      task('C')
    ]

    expect(keysBy(viewGroups(tasks, 'assignee', '2026-10-17'))).toEqual([
      'assignee:lea=A',
      'assignee:tom=A',
      'assignee:none=B,C'
    ])
    expect(keysBy(viewGroups(tasks, 'label', '2026-10-17'))).toEqual([
      'label:bug=B',
      'label:client=A,B',
      'label:none=C'
    ])
  })

  it('orders priorities from the highest and dates from the soonest', () => {
    const tasks = [
      task('A', { priority: 3, dueDate: '2026-10-30' }),
      task('B', { dueDate: '2026-10-16' }),
      task('C', { priority: 1, dueDate: '2026-10-17' }),
      task('D', { dueDate: '2026-10-23' })
    ]

    expect(keysBy(viewGroups(tasks, 'priority', '2026-10-17'))).toEqual([
      'priority:1=C',
      'priority:3=A',
      'priority:none=B,D'
    ])
    expect(keysBy(viewGroups(tasks, 'due', '2026-10-17'))).toEqual([
      'due:overdue=B',
      'due:today=C',
      'due:week=D',
      'due:later=A'
    ])
  })
})
