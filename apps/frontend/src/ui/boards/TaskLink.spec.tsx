import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

function logoWithSketch() {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
  const logo = aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
  const sketch = aTask(null, {
    key: 'DES-2',
    title: 'Sketch',
    parentId: logo.id
  })
  board.tasks = [logo, sketch]
  return { board, boardsApi: fakeBoardsApi([board]) }
}

describe('a link to a task', () => {
  it('opens the board with that task shown', async () => {
    const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
    const section = board.sections[0] ?? null
    board.tasks = [
      aTask(section, { key: 'DES-1', title: 'Logo' }),
      aTask(section, { key: 'DES-2', title: 'Poster' })
    ]

    renderRoute(`/boards/${board.id}?task=DES-2`, {
      boardsApi: fakeBoardsApi([board])
    })

    expect(
      await screen.findByRole('dialog', { name: 'DES-2 Poster' })
    ).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('opens a sub-task over its parent', async () => {
    const { board, boardsApi } = logoWithSketch()

    renderRoute(`/boards/${board.id}?task=DES-2`, { boardsApi })

    expect(
      await screen.findByRole('dialog', { name: 'DES-2 Sketch' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('dialog', { name: 'DES-1 Logo', hidden: true })
    ).toBeInTheDocument()
  })

  it('follows the sub-task shown, and goes back to its parent on close', async () => {
    const { board, boardsApi } = logoWithSketch()
    const { router } = renderRoute(`/boards/${board.id}?task=DES-1`, {
      boardsApi
    })

    const parent = within(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    )
    fireEvent.click(parent.getByRole('button', { name: 'Sketch' }))
    const child = within(
      await screen.findByRole('dialog', { name: 'DES-2 Sketch' })
    )
    expect(router.state.location.search).toBe('?task=DES-2')

    fireEvent.click(child.getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(router.state.location.search).toBe('?task=DES-1')
    })
    expect(
      screen.queryByRole('dialog', { name: 'DES-2 Sketch' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('dialog', { name: 'DES-1 Logo' })
    ).toBeInTheDocument()
  })

  it('opens a task the layout does not show', async () => {
    const board = aBoard({
      name: 'Design',
      keyPrefix: 'DES',
      layout: 'calendar'
    })
    board.tasks = [
      aTask(board.sections[0] ?? null, {
        key: 'DES-1',
        title: 'Launch',
        dueDate: '2099-01-15'
      })
    ]

    renderRoute(`/boards/${board.id}?task=DES-1`, {
      boardsApi: fakeBoardsApi([board])
    })

    expect(
      await screen.findByRole('dialog', { name: 'DES-1 Launch' })
    ).toBeInTheDocument()
  })

  it('says a task it cannot find, and leaves the board alone', async () => {
    const { board, boardsApi } = logoWithSketch()
    const { router } = renderRoute(`/boards/${board.id}?task=DES-999`, {
      boardsApi
    })

    expect(
      await screen.findByText("This task doesn't exist, or you can't open it.")
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('article', { name: 'DES-1 Logo' })
    ).toBeInTheDocument()
  })

  it.each([
    ['archived', 'archiveTask', 'This task is archived.'],
    ['trash', 'trashTask', 'In the trash, deleted for good in 30 days.']
  ] as const)(
    'opens a task in the %s on that page',
    async (shelf, remove, notice) => {
      const { board, boardsApi } = logoWithSketch()
      const logo = board.tasks[0]
      if (!logo) throw new Error('no task')
      await boardsApi[remove](board.id, logo.id)

      const { router } = renderRoute(`/boards/${board.id}?task=DES-1`, {
        boardsApi
      })

      const panel = within(
        await screen.findByRole('dialog', { name: 'DES-1 Logo' })
      )
      expect(panel.getByText(notice)).toBeInTheDocument()
      expect(router.state.location.pathname).toBe(
        `/boards/${board.id}/${shelf}`
      )
      expect(router.state.location.search).toBe('?task=DES-1')
      expect(screen.queryByText(/This task doesn't exist/)).toBeNull()
    }
  )
})
