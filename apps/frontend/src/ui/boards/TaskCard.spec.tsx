import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Task } from '@/domain/board'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const person = (name: string) => ({
  userId: name,
  email: `${name}@example.com`,
  name: null
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

  it('strikes the title of a card in a done section through, with no checkbox', async () => {
    const board = aBoard()
    board.tasks = [
      aTask(board.sections[2] ?? null, { key: 'DES-1', title: 'Logo' })
    ]
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    expect(await screen.findByRole('button', { name: 'Logo' })).toHaveStyle({
      textDecoration: 'line-through'
    })
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  describe('menu', () => {
    function renderBoard() {
      const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
      board.tasks = [
        aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
      ]
      const ops = aBoard({ name: 'Ops', keyPrefix: 'OPS' })
      const boardsApi = fakeBoardsApi([board, ops])
      renderRoute(`/boards/${board.id}`, { boardsApi })
      return { board, boardsApi }
    }
    async function openMenu() {
      const card = within(
        await screen.findByRole('article', { name: 'DES-1 Logo' })
      )
      fireEvent.click(card.getByRole('button', { name: 'Options for DES-1' }))
      return within(await screen.findByRole('menu'))
    }

    it('offers the everyday task actions in order', async () => {
      renderBoard()

      const menu = await openMenu()

      await waitFor(() => {
        expect(
          menu.getAllByRole('menuitem').map(item => item.textContent)
        ).toEqual([
          'Assign',
          'Labels',
          'Due date…',
          'Move to In progress',
          'Move to Done',
          'Move to another board',
          'Copy link',
          'Archive',
          'Delete'
        ])
      })
    })

    it('edits the due date without opening the task', async () => {
      const { board, boardsApi } = renderBoard()

      const menu = await openMenu()
      fireEvent.click(menu.getByRole('menuitem', { name: 'Due date…' }))
      const dates = within(await screen.findByRole('dialog', { name: 'Dates' }))
      fireEvent.click(dates.getByRole('button', { name: 'Today' }))
      fireEvent.click(dates.getByRole('button', { name: 'Save dates' }))

      await waitFor(() => {
        expect(boardsApi.editTask).toHaveBeenCalledWith(
          board.id,
          board.tasks[0]?.id,
          expect.objectContaining({ dueDate: expect.any(String) as string })
        )
      })
      expect(screen.queryByRole('dialog', { name: 'DES-1 Logo' })).toBeNull()
    })

    it('copies the link of the task', async () => {
      const writeText = vi.fn(() => Promise.resolve())
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true
      })
      const { board } = renderBoard()

      const menu = await openMenu()
      fireEvent.click(menu.getByRole('menuitem', { name: 'Copy link' }))

      expect(await screen.findByText('Link copied')).toBeInTheDocument()
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/boards/${board.id}?task=DES-1`
      )
    })

    it.each([
      ['Archive', 'archiveTask', 'DES-1 archived'],
      ['Delete', 'trashTask', 'DES-1 moved to the trash']
    ] as const)(
      '%s removes the card, with an undo',
      async (item, call, notice) => {
        const { board, boardsApi } = renderBoard()
        const taskId = board.tasks[0]?.id

        const menu = await openMenu()
        fireEvent.click(menu.getByRole('menuitem', { name: item }))

        expect(await screen.findByText(notice)).toBeInTheDocument()
        expect(boardsApi[call]).toHaveBeenCalledWith(board.id, taskId)
        await waitFor(() => {
          expect(
            screen.queryByRole('article', { name: 'DES-1 Logo' })
          ).toBeNull()
        })
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
        expect(
          await screen.findByRole('article', { name: 'DES-1 Logo' })
        ).toBeInTheDocument()
      }
    )

    it('opens the move to another board dialog', async () => {
      renderBoard()

      const menu = await openMenu()
      fireEvent.click(
        await menu.findByRole('menuitem', { name: 'Move to another board' })
      )

      expect(
        await screen.findByRole('form', { name: 'Move to another board' })
      ).toBeInTheDocument()
    })
  })

  describe('panel', () => {
    async function renderBoard(search: string) {
      const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
      board.tasks = [
        aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
      ]
      const { router } = renderRoute(`/boards/${board.id}${search}`, {
        boardsApi: fakeBoardsApi([board])
      })
      await screen.findByRole('article', { name: 'DES-1 Logo', hidden: true })
      return router
    }

    it('puts the task in the URL when opened, keeping the other params', async () => {
      const router = await renderBoard('?q=a')

      fireEvent.click(screen.getByRole('button', { name: 'Logo' }))

      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
      expect(router.state.location.search).toBe('?q=a&task=DES-1')
      expect(router.state.historyAction).toBe('REPLACE')
    })

    it('takes the task out of the URL when closed, keeping the other params', async () => {
      const router = await renderBoard('?q=a&task=DES-1')

      const dialog = await screen.findByRole('dialog', { name: 'DES-1 Logo' })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'DES-1 Logo' })).toBeNull()
      })
      expect(router.state.location.search).toBe('?q=a')
    })
  })
})
