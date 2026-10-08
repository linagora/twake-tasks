import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'
import { formatDay, localToday } from '@/ui/boards/dueLabel'

function designBoard(overrides: Parameters<typeof aBoard>[0] = {}) {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES', ...overrides })
  const [todo, doing] = board.sections
  board.tasks = [
    aTask(todo ?? null, { key: 'DES-1', title: 'Logo', dueDate: localToday() }),
    aTask(doing ?? null, { key: 'DES-2', title: 'Palette' })
  ]
  return board
}

const layouts = () => within(screen.getByRole('group', { name: 'Layout' }))

describe('board layouts', () => {
  it('switches to a list of sections, and keeps my pick', async () => {
    const board = designBoard()
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    await screen.findByRole('heading', { level: 1, name: 'Design' })
    fireEvent.click(layouts().getByRole('button', { name: 'List' }))

    expect(
      await screen.findByRole('list', { name: 'In progress' })
    ).toHaveTextContent('Palette')
    expect(layouts().getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(boardsApi.setLayout).toHaveBeenCalledWith(board.id, 'list')
  })

  it('lists each task on one row with its facts', async () => {
    const board = designBoard({ layout: 'list', defaultLayout: 'list' })
    const ann = { userId: 'ann', email: 'ann@example.com', name: 'Ann Lee' }
    board.members = [ann]
    Object.assign(board.tasks[0] ?? {}, {
      priority: 1,
      assignees: [ann],
      labels: [{ id: 'urgent', name: 'Urgent' }]
    })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const row = within(
      await screen.findByRole('listitem', { name: 'DES-1 Logo' })
    )
    expect(row.getByText('DES-1')).toBeVisible()
    expect(row.getByRole('button', { name: 'Logo' })).toBeVisible()
    expect(row.getByRole('img', { name: 'Assigned to Ann Lee' })).toBeVisible()
    expect(row.getByLabelText(/^Due /)).toBeVisible()
    expect(row.getByLabelText('Priority 1')).toBeVisible()
    expect(row.getByText('Urgent')).toBeVisible()
  })

  it('completes a task outside sections in place', async () => {
    const board = designBoard({ layout: 'list', defaultLayout: 'list' })
    Object.assign(board.tasks[0] ?? {}, { sectionId: null })
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Complete Logo' })
    )

    await waitFor(() => {
      expect(boardsApi.completeTask).toHaveBeenCalledWith(
        board.id,
        board.tasks[0]?.id,
        'completed'
      )
    })
  })

  it('collapses a section and shows its count', async () => {
    const board = designBoard({ layout: 'list', defaultLayout: 'list' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const header = await screen.findByRole('button', { name: 'In progress 1' })
    expect(header).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(header)

    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list', { name: 'In progress' })).toBeNull()
    expect(screen.getByRole('list', { name: 'To do' })).toBeVisible()
  })

  it('opens a task from its row and completes one from its checkbox', async () => {
    const board = designBoard({ layout: 'list', defaultLayout: 'list' })
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const row = within(
      await screen.findByRole('listitem', { name: 'DES-2 Palette' })
    )
    fireEvent.click(row.getByRole('checkbox', { name: 'Complete Palette' }))
    await waitFor(() => {
      expect(boardsApi.moveTask).toHaveBeenCalledWith(
        board.id,
        board.tasks[1]?.id,
        { sectionId: board.sections[2]?.id }
      )
    })
    const done = within(
      within(screen.getByRole('list', { name: 'Done' })).getByRole('listitem', {
        name: 'DES-2 Palette'
      })
    )
    expect(
      done.getByRole('checkbox', { name: 'Complete Palette' })
    ).toBeChecked()

    fireEvent.click(done.getByRole('button', { name: 'Palette' }))
    expect(
      await screen.findByRole('dialog', { name: 'DES-2 Palette' })
    ).toBeVisible()
  })

  it('places dated tasks on a month calendar, undated ones aside', async () => {
    const board = designBoard({ layout: 'calendar', defaultLayout: 'calendar' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const today = await screen.findByRole('region', {
      name: formatDay(localToday(), 'en')
    })
    expect(within(today).getByText('Logo')).toBeVisible()
    expect(
      within(screen.getByRole('list', { name: 'No date' })).getByText('Palette')
    ).toBeVisible()
  })

  it('names the weekdays, marks today and comes back to it', async () => {
    const board = designBoard({ layout: 'calendar', defaultLayout: 'calendar' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const today = await screen.findByRole('region', {
      name: formatDay(localToday(), 'en')
    })
    expect(today).toHaveAttribute('aria-current', 'date')
    expect(screen.getByText('Mon')).toBeVisible()
    const month = new Intl.DateTimeFormat('en', {
      month: 'long',
      year: 'numeric'
    }).format(new Date())
    expect(screen.getByRole('heading', { name: month })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.queryByRole('heading', { name: month })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByRole('heading', { name: month })).toBeVisible()
  })

  it('opens a task from its day', async () => {
    const board = designBoard({ layout: 'calendar', defaultLayout: 'calendar' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const today = await screen.findByRole('region', {
      name: formatDay(localToday(), 'en')
    })
    fireEvent.click(within(today).getByRole('button', { name: 'Logo' }))

    expect(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    ).toBeVisible()
  })

  it('adds a task due on a day from the header', async () => {
    const board = designBoard({ layout: 'calendar', defaultLayout: 'calendar' })
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'Add task' }))
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.change(dialog.getByRole('textbox', { name: 'Task title' }), {
      target: { value: 'Moodboard' }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(boardsApi.editTask).toHaveBeenCalledWith(
        board.id,
        expect.any(String),
        { dueDate: localToday() }
      )
    })
    expect(boardsApi.createTask).toHaveBeenCalledWith(board.id, {
      sectionId: board.sections[0]?.id,
      title: 'Moodboard'
    })
  })

  it('lets an admin make the current layout the board default', async () => {
    const board = designBoard()
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    await screen.findByRole('heading', { level: 1, name: 'Design' })
    fireEvent.click(screen.getByRole('button', { name: 'Board options' }))
    expect(
      within(await screen.findByRole('menu')).queryByRole('menuitem', {
        name: 'Use as default layout'
      })
    ).toBeNull()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull()
    })
    fireEvent.click(layouts().getByRole('button', { name: 'Calendar' }))
    await screen.findByRole('list', { name: 'No date' })
    fireEvent.click(screen.getByRole('button', { name: 'Board options' }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Use as default layout' })
    )

    await screen.findByRole('list', { name: 'No date' })
    expect(boardsApi.setDefaultLayout).toHaveBeenCalledWith(
      board.id,
      'calendar'
    )
  })

  describe('task panel', () => {
    const panel = () => screen.queryByRole('dialog', { name: 'DES-1 Logo' })

    it('stays closed when the view changes after closing a deep-linked task', async () => {
      const board = designBoard()
      const { router } = renderRoute(`/boards/${board.id}?task=DES-1`, {
        boardsApi: fakeBoardsApi([board])
      })

      const open = await screen.findByRole('dialog', { name: 'DES-1 Logo' })
      fireEvent.click(within(open).getByRole('button', { name: 'Close' }))
      await waitFor(() => {
        expect(panel()).toBeNull()
      })
      expect(router.state.location.search).toBe('')

      fireEvent.click(layouts().getByRole('button', { name: 'List' }))
      await screen.findByRole('list', { name: 'In progress' })
      expect(panel()).toBeNull()

      fireEvent.click(layouts().getByRole('button', { name: 'Calendar' }))
      await screen.findByRole('button', { name: 'Logo' })
      expect(panel()).toBeNull()
      expect(router.state.location.search).toBe('')
    })

    it.each(['board', 'list', 'calendar'] as const)(
      'opens a deep-linked task in the %s view',
      async layout => {
        const board = designBoard({ layout, defaultLayout: layout })
        renderRoute(`/boards/${board.id}?task=DES-1`, {
          boardsApi: fakeBoardsApi([board])
        })

        expect(
          await screen.findByRole('dialog', { name: 'DES-1 Logo' })
        ).toBeInTheDocument()
      }
    )
  })
})
