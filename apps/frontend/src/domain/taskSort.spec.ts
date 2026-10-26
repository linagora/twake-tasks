import { describe, expect, it } from 'vitest'

import { aTask } from '@/testing/fakeBoardsApi'

import { nextSort, sortTasks } from './taskSort'

const collator = new Intl.Collator('en')
const person = (name: string) => ({
  userId: name,
  email: `${name}@example.com`,
  name,
  avatar: null
})
const label = (name: string) => ({ id: name, name, color: null })

const logo = aTask(null, {
  title: 'Logo',
  dueDate: '2026-11-02',
  priority: 2,
  assignees: [person('Zoé')],
  labels: [label('urgent')]
})
const banner = aTask(null, {
  title: 'banner',
  dueDate: '2026-10-30',
  priority: 1,
  assignees: [person('ann')],
  labels: [label('client'), label('web')]
})
const flyer = aTask(null, { title: 'Flyer' })
const titles = (tasks: { title: string }[]) => tasks.map(task => task.title)

describe('sortTasks', () => {
  it('sorts by title regardless of case, then backwards', () => {
    const tasks = [logo, flyer, banner]

    expect(
      titles(sortTasks(tasks, { key: 'title', order: 'asc' }, collator))
    ).toEqual(['banner', 'Flyer', 'Logo'])
    expect(
      titles(sortTasks(tasks, { key: 'title', order: 'desc' }, collator))
    ).toEqual(['Logo', 'Flyer', 'banner'])
  })

  it('keeps the tasks without a value last, either way', () => {
    const tasks = [flyer, logo, banner]

    for (const key of ['assignees', 'due', 'priority', 'labels'] as const) {
      expect(titles(sortTasks(tasks, { key, order: 'asc' }, collator))).toEqual(
        ['banner', 'Logo', 'Flyer']
      )
      expect(
        titles(sortTasks(tasks, { key, order: 'desc' }, collator))
      ).toEqual(['Logo', 'banner', 'Flyer'])
    }
  })

  it('keeps the order of the tasks that tie', () => {
    const second = { ...flyer, id: 'second', title: 'Second' }

    expect(
      titles(sortTasks([flyer, second], { key: 'due', order: 'asc' }, collator))
    ).toEqual(['Flyer', 'Second'])
  })
})

describe('nextSort', () => {
  it('goes up, down, then back to the order of the board', () => {
    const up = nextSort(null, 'due')
    const down = nextSort(up, 'due')

    expect(up).toEqual({ key: 'due', order: 'asc' })
    expect(down).toEqual({ key: 'due', order: 'desc' })
    expect(nextSort(down, 'due')).toBeNull()
    expect(nextSort(down, 'title')).toEqual({ key: 'title', order: 'asc' })
  })
})
