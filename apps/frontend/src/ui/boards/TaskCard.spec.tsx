import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Task } from '@/domain/board'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const person = (name: string) => ({
  userId: name,
  email: `${name}@example.com`
})

async function cardOf(overrides: Partial<Task>, extra: Task[] = []) {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
  const logo = aTask(board.sections[0] ?? null, {
    key: 'DES-1',
    title: 'Logo',
    ...overrides
  })
  board.tasks = [logo, ...extra.map(task => ({ ...task, parentId: logo.id }))]
  renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })
  return within(await screen.findByRole('article', { name: 'DES-1 Logo' }))
}

describe('TaskCard', () => {
  it('marks a past due date as overdue', async () => {
    const card = await cardOf({ dueDate: '2020-03-02' })

    expect(card.getByLabelText('Overdue, due Mar 2, 2020')).toBeInTheDocument()
  })

  it('does not mark a done task as overdue', async () => {
    const card = await cardOf({
      dueDate: '2020-03-02',
      completedAt: '2020-03-01T10:00:00Z'
    })

    expect(card.getByLabelText('Due Mar 2, 2020')).toBeInTheDocument()
  })

  it('counts the comments', async () => {
    const card = await cardOf({ commentCount: 2 })

    expect(card.getByLabelText('2 comments')).toBeInTheDocument()
  })

  it('shows no comment count without comments', async () => {
    const card = await cardOf({})

    expect(card.queryByLabelText(/comment/)).not.toBeInTheDocument()
  })

  it('folds the sub-tasks behind their progress', async () => {
    const card = await cardOf({}, [
      aTask(null, { key: 'DES-2', title: 'Sketch' }),
      aTask(null, {
        key: 'DES-3',
        title: 'Colors',
        completedAt: '2026-01-01T00:00:00Z'
      })
    ])

    const progress = card.getByRole('button', {
      name: 'Sub-tasks, 1 of 2 done'
    })
    expect(progress).toHaveAttribute('aria-expanded', 'false')
    expect(card.queryByRole('checkbox', { name: 'Sketch' })).toBeNull()

    fireEvent.click(progress)

    expect(card.getByRole('checkbox', { name: 'Colors' })).toBeChecked()
  })

  it('shows the first assignees and how many more there are', async () => {
    const card = await cardOf({
      assignees: ['ann', 'ben', 'cat', 'dan', 'eve'].map(person)
    })

    expect(
      card.getByRole('img', { name: 'Assigned to ann@example.com' })
    ).toBeInTheDocument()
    expect(card.getAllByRole('img', { name: /^Assigned to/ })).toHaveLength(2)
    expect(card.getByLabelText('3 more assignees')).toBeInTheDocument()
  })
})
