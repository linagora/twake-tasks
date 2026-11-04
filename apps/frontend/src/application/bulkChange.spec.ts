import { describe, expect, it } from 'vitest'

import { undoOf } from '@/application/bulkChange'
import { aTask } from '@/testing/fakeBoardsApi'

const todo = { id: 'todo', name: 'To do', category: 'unstarted' as const }
const doing = { id: 'doing', name: 'Doing', category: 'started' as const }
const bob = {
  userId: 'bob',
  email: 'bob@example.com',
  name: null,
  avatar: null
}

describe('undoing a change of several tasks', () => {
  it('moves each task back to the section it was in', () => {
    const first = aTask(todo)
    const second = aTask(doing)
    const third = aTask(todo)

    expect(
      undoOf([first, second, third], { kind: 'move', sectionId: 'done' })
    ).toEqual([
      {
        taskIds: [first.id, third.id],
        action: { kind: 'move', sectionId: 'todo' }
      },
      { taskIds: [second.id], action: { kind: 'move', sectionId: 'doing' } }
    ])
  })

  it('unassigns only the tasks the person was added to', () => {
    const had = aTask(todo, { assignees: [bob] })
    const lacked = aTask(todo)

    expect(
      undoOf([had, lacked], { kind: 'assign', userId: 'bob', assigned: true })
    ).toEqual([
      {
        taskIds: [lacked.id],
        action: { kind: 'assign', userId: 'bob', assigned: false }
      }
    ])
  })

  it('gives back each task its own due date, time and repeat', () => {
    const timed = aTask(todo, {
      dueDate: '2026-11-03',
      dueTime: '09:30',
      dueZone: 'Europe/Paris',
      recurrence: { every: 1, unit: 'weeks', fromCompletion: false }
    })
    const undated = aTask(todo)

    expect(
      undoOf([timed, undated], { kind: 'edit', changes: { dueDate: null } })
    ).toEqual([
      {
        taskIds: [timed.id],
        action: {
          kind: 'edit',
          changes: {
            dueDate: '2026-11-03',
            dueTime: '09:30',
            dueZone: 'Europe/Paris',
            recurrence: { every: 1, unit: 'weeks', fromCompletion: false }
          }
        }
      },
      {
        taskIds: [undated.id],
        action: { kind: 'edit', changes: { dueDate: null } }
      }
    ])
  })

  it('restores archived or trashed tasks, and has no way back from another board', () => {
    const task = aTask(todo)

    expect(undoOf([task], { kind: 'trash' })).toEqual([
      { taskIds: [task.id], action: { kind: 'restore' } }
    ])
    expect(
      undoOf([task], {
        kind: 'transfer',
        to: { boardId: 'ops', sectionId: null }
      })
    ).toBeNull()
  })
})
