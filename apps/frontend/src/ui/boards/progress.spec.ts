import { describe, expect, it } from 'vitest'

import { aBoard, aTask } from '@/testing/fakeBoardsApi'
import {
  boardProgress,
  completionsByWeek,
  weekStart
} from '@/ui/boards/progress'

const TODAY = '2026-11-05'

describe('board progress', () => {
  it('counts the open top-level tasks, late, due this week and unassigned', () => {
    const board = aBoard()
    const [todo, , done] = board.sections
    const bob = { userId: 'bob', email: 'bob@example.com', name: 'Bob' }
    const parent = aTask(todo ?? null, { dueDate: '2026-11-01' })
    board.tasks = [
      parent,
      aTask(todo ?? null, { dueDate: '2026-11-04', assignees: [bob] }),
      aTask(todo ?? null, { dueDate: '2026-11-11', assignees: [bob] }),
      aTask(todo ?? null, { dueDate: '2026-11-12', priority: 1 }),
      aTask(done ?? null, { dueDate: '2026-11-01', assignees: [bob] }),
      aTask(null, { canceledAt: '2026-11-01T10:00:00Z' }),
      aTask(todo ?? null, { parentId: parent.id, dueDate: '2026-11-01' })
    ]

    const progress = boardProgress(board, TODAY)

    expect(progress).toMatchObject({
      total: 6,
      open: 4,
      overdue: 2,
      dueWeek: 1,
      people: [{ person: bob, open: 2, overdue: 1, dueWeek: 1 }],
      nobody: { open: 2, overdue: 1, dueWeek: 0 }
    })
    expect(progress.sections).toEqual([
      { section: null, count: 1 },
      { section: todo, count: 4 },
      { section: board.sections[1], count: 0 },
      { section: done, count: 1 }
    ])
    expect(progress.priorities).toEqual([
      { priority: 1, count: 1 },
      { priority: 2, count: 0 },
      { priority: 3, count: 0 },
      { priority: 4, count: 0 },
      { priority: null, count: 3 }
    ])
  })

  it('starts weeks on the locale first day', () => {
    expect(weekStart(TODAY, 1)).toBe('2026-11-02')
    expect(weekStart(TODAY, 0)).toBe('2026-11-01')
    expect(weekStart('2026-11-01', 1)).toBe('2026-10-26')
  })

  it('sums the completions of eight weeks and of the last seven days', () => {
    const { weeks, lastSevenDays } = completionsByWeek(
      [
        { day: '2026-09-07', done: 9 },
        { day: '2026-09-14', done: 1 },
        { day: '2026-10-29', done: 2 },
        { day: '2026-10-30', done: 3 },
        { day: '2026-11-02', done: 4 }
      ],
      TODAY,
      1
    )

    expect(weeks).toHaveLength(8)
    expect(weeks[0]).toEqual({ start: '2026-09-14', done: 1 })
    expect(weeks.slice(-2)).toEqual([
      { start: '2026-10-26', done: 5 },
      { start: '2026-11-02', done: 4 }
    ])
    expect(lastSevenDays).toBe(7)
  })
})
