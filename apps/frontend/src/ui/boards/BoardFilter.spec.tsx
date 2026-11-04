import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Board } from '@/domain/board'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const alice = { userId: 'alice', email: 'alice@example.com', name: 'Alice' }
const bob = { userId: 'bob', email: 'bob@example.com', name: 'Bob' }
const urgent = { id: 'urgent', name: 'Urgent', color: null }

function eventBoard(overrides: Partial<Board> = {}) {
  const board = aBoard({
    name: 'Spring event',
    keyPrefix: 'EVT',
    members: [alice, bob],
    labels: [urgent],
    ...overrides
  })
  const [todo, doing] = board.sections
  board.tasks = [
    aTask(todo ?? null, {
      key: 'EVT-1',
      title: 'Book the vénue',
      assignees: [alice]
    }),
    aTask(todo ?? null, {
      key: 'EVT-2',
      title: 'Order flowers',
      priority: 1,
      labels: [urgent]
    }),
    aTask(doing ?? null, {
      key: 'EVT-3',
      title: 'Print badges',
      assignees: [bob],
      labels: [urgent]
    })
  ]
  return board
}

const column = (name: string) => screen.getByRole('region', { name })
const cards = () =>
  screen.getAllByRole('article').map(card => card.getAttribute('aria-label'))

async function pick(criterion: RegExp, option: RegExp | string) {
  fireEvent.click(screen.getByRole('button', { name: criterion }))
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: option }))
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  await waitFor(() => {
    expect(screen.queryByRole('menu')).toBe(null)
  })
}

describe('the board filter', () => {
  it('narrows the board to my tasks, counting them in each section', async () => {
    const board = eventBoard()
    const { router } = renderRoute(`/boards/${board.id}`, {
      boardsApi: fakeBoardsApi([board])
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Filter' }))
    await pick(/^Assignee/, 'Me')

    expect(cards()).toEqual(['EVT-1 Book the vénue'])
    expect(within(column('To do')).getByText('1 of 2')).toBeInTheDocument()
    expect(
      within(column('In progress')).getByText('0 of 1')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Filter · 1' })
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe('?assignee=me')
  })

  it('ors the values of a criterion and ands the criteria', async () => {
    const board = eventBoard()
    renderRoute(`/boards/${board.id}?label=Urgent`, {
      boardsApi: fakeBoardsApi([board])
    })

    await screen.findByRole('search', { name: 'Filter the board' })
    expect(cards()).toEqual(['EVT-2 Order flowers', 'EVT-3 Print badges'])

    await pick(/^Priority/, 'P1')
    expect(cards()).toEqual(['EVT-2 Order flowers'])
  })

  it('opens filtered from a link, matching the text without accents', async () => {
    const board = eventBoard()
    renderRoute(`/boards/${board.id}?text=VENUE`, {
      boardsApi: fakeBoardsApi([board])
    })

    expect(
      await screen.findByRole('textbox', { name: 'Filter by title or key' })
    ).toHaveValue('VENUE')
    expect(cards()).toEqual(['EVT-1 Book the vénue'])
  })

  it('says when nothing matches, and clears the filter', async () => {
    const board = eventBoard()
    renderRoute(`/boards/${board.id}?text=caterer`, {
      boardsApi: fakeBoardsApi([board])
    })

    expect(
      await screen.findByText('No task on this board matches these filters.')
    ).toBeInTheDocument()
    expect(screen.getAllByRole('region')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(cards()).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument()
  })

  it('keeps a task added in a filtered section in sight', async () => {
    const board = eventBoard()
    renderRoute(`/boards/${board.id}?assignee=me`, {
      boardsApi: fakeBoardsApi([board])
    })

    const todo = within(await screen.findByRole('region', { name: 'To do' }))
    fireEvent.click(todo.getByRole('button', { name: 'Add a task to To do' }))
    fireEvent.change(todo.getByRole('textbox', { name: 'Task title' }), {
      target: { value: 'Hire a DJ' }
    })
    fireEvent.click(todo.getByRole('button', { name: 'Add' }))

    expect(
      await todo.findByRole('article', { name: /Hire a DJ/ })
    ).toBeInTheDocument()
  })

  it('filters a viewer’s list and calendar too', async () => {
    const board = eventBoard({ role: 'viewer', layout: 'list' })
    renderRoute(`/boards/${board.id}?label=urgent`, {
      boardsApi: fakeBoardsApi([board])
    })

    const list = await screen.findByRole('list', { name: 'To do' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
  })

  it('opens the New filter form with the criteria, not the text', async () => {
    const board = eventBoard()
    const { router } = renderRoute(`/boards/${board.id}?text=x&priority=1`, {
      boardsApi: fakeBoardsApi([board])
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Save as filter' })
    )

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/filters')
    })
    expect(router.state.location.state).toEqual({
      criteria: { board: [board.id], priority: [1] }
    })
    expect(
      await screen.findByRole('heading', { name: 'New filter' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Priority' })
    ).toHaveTextContent('P1')
  })

  it('opens on "f" and closes on Escape, keeping the filter', async () => {
    const board = eventBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })
    await screen.findByRole('button', { name: 'Filter' })

    fireEvent.keyDown(document.body, { key: 'f' })
    const text = await screen.findByRole('textbox', {
      name: 'Filter by title or key'
    })
    await waitFor(() => {
      expect(text).toHaveFocus()
    })
    fireEvent.change(text, { target: { value: 'badges' } })
    fireEvent.keyDown(text, { key: 'Escape' })

    expect(screen.queryByRole('search', { name: 'Filter the board' })).toBe(
      null
    )
    expect(cards()).toEqual(['EVT-3 Print badges'])
    expect(
      screen.getByRole('button', { name: 'Filter · 1' })
    ).toBeInTheDocument()
  })
})
