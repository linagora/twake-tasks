import { describe, expect, it } from 'vitest'

import { aBoard, aTask } from '@/testing/fakeBoardsApi'
import {
  NO_FILTER,
  criteriaCount,
  readFilter,
  savedCriteria,
  taskMatches,
  writeFilter,
  type BoardFilter
} from '@/ui/boards/taskFilter'

const alice = { userId: 'alice', email: 'Alice@example.com', name: 'Alice' }
const bob = { userId: 'bob', email: 'bob@example.com', name: null }
const board = aBoard()
const [todo, , done] = board.sections
const context = {
  myEmail: 'alice@example.com',
  today: '2026-11-04',
  sections: board.sections
}
const matches = (
  filter: Partial<BoardFilter>,
  task: ReturnType<typeof aTask>
) => taskMatches(task, { ...NO_FILTER, ...filter }, context)

describe('taskMatches', () => {
  it('finds the text in the title or the key, ignoring case and accents', () => {
    const task = aTask(todo ?? null, { key: 'EVT-12', title: 'Book the Vénue' })
    expect(matches({ text: 'venue' }, task)).toBe(true)
    expect(matches({ text: 'evt-12' }, task)).toBe(true)
    expect(matches({ text: 'book venue' }, task)).toBe(true)
    expect(matches({ text: 'caterer' }, task)).toBe(false)
  })

  it('matches me by email, nobody, and anyone picked', () => {
    const mine = aTask(todo ?? null, { assignees: [alice] })
    const bobs = aTask(todo ?? null, { assignees: [bob] })
    const none = aTask(todo ?? null)
    expect(matches({ assignee: ['me'] }, mine)).toBe(true)
    expect(matches({ assignee: ['me'] }, bobs)).toBe(false)
    expect(matches({ assignee: ['nobody'] }, none)).toBe(true)
    expect(matches({ assignee: ['nobody', 'bob'] }, bobs)).toBe(true)
    expect(matches({ assignee: ['nobody', 'bob'] }, mine)).toBe(false)
  })

  it('ors the values of a criterion and ands the criteria', () => {
    const urgent = { id: 'l1', name: 'Urgent', color: null }
    const venue = { id: 'l2', name: 'Venue', color: null }
    const p1Urgent = aTask(todo ?? null, { priority: 1, labels: [urgent] })
    const p2Venue = aTask(todo ?? null, { priority: 2, labels: [venue] })
    expect(matches({ label: ['urgent', 'venue'] }, p2Venue)).toBe(true)
    expect(matches({ label: ['Urgent'], priority: [1] }, p1Urgent)).toBe(true)
    expect(matches({ label: ['Urgent'], priority: [1] }, p2Venue)).toBe(false)
    expect(matches({ priority: [1] }, aTask(todo ?? null))).toBe(false)
  })

  it('reads due days from today, and nothing done is overdue', () => {
    const due = (dueDate: string | null, section = todo) =>
      aTask(section ?? null, { dueDate })
    expect(matches({ due: ['overdue'] }, due('2026-11-03'))).toBe(true)
    expect(matches({ due: ['overdue'] }, due('2026-11-03', done))).toBe(false)
    expect(matches({ due: ['today'] }, due('2026-11-04'))).toBe(true)
    expect(matches({ due: ['week'] }, due('2026-11-10'))).toBe(true)
    expect(matches({ due: ['week'] }, due('2026-11-11'))).toBe(false)
    expect(matches({ due: ['none'] }, due(null))).toBe(true)
    expect(matches({ due: ['overdue', 'none'] }, due('2026-11-05'))).toBe(false)
  })
})

describe('the filter in the URL', () => {
  it('reads back what it wrote, and keeps the other parameters', () => {
    const filter: BoardFilter = {
      text: 'venue',
      assignee: ['me', 'bob'],
      label: ['Urgent'],
      priority: [1],
      due: ['overdue']
    }
    const params = writeFilter(
      new URLSearchParams('task=EVT-1&due=2026-11-05'),
      filter
    )
    expect(params.get('task')).toBe('EVT-1')
    expect(params.get('due')).toBe('2026-11-05')
    expect(readFilter(params)).toEqual(filter)
    expect(criteriaCount(filter)).toBe(5)
    expect(readFilter(writeFilter(params, NO_FILTER))).toEqual(NO_FILTER)
  })

  it('drops values it does not know', () => {
    expect(readFilter(new URLSearchParams('priority=9&when=later'))).toEqual(
      NO_FILTER
    )
  })
})

describe('savedCriteria', () => {
  it('keeps the board and drops the text, which saved filters lack', () => {
    expect(
      savedCriteria({ ...NO_FILTER, text: 'venue', priority: [1] }, 'b1')
    ).toEqual({ board: ['b1'], priority: [1] })
  })
})
