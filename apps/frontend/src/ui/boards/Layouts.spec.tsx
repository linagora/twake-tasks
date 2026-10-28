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

const todayCell = () =>
  screen.findByRole('group', {
    name: `${formatDay(localToday(), 'en')}, today`
  })

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

  it('opens a task from its row, which has no checkbox', async () => {
    const board = designBoard({ layout: 'list', defaultLayout: 'list' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const row = within(
      await screen.findByRole('listitem', { name: 'DES-2 Palette' })
    )
    expect(row.queryByRole('checkbox')).toBeNull()

    fireEvent.click(row.getByRole('button', { name: 'Palette' }))
    expect(
      await screen.findByRole('dialog', { name: 'DES-2 Palette' })
    ).toBeVisible()
  })

  it('places dated tasks on a month calendar, undated ones aside', async () => {
    const board = designBoard({ layout: 'calendar', defaultLayout: 'calendar' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const today = await todayCell()
    expect(within(today).getByText('Logo')).toBeVisible()
    expect(
      within(screen.getByRole('list', { name: 'No date' })).getByText('Palette')
    ).toBeVisible()
  })

  it('adds a task due on a day from its +', async () => {
    const board = designBoard({ layout: 'calendar', defaultLayout: 'calendar' })
    const { router } = renderRoute(`/boards/${board.id}`, {
      boardsApi: fakeBoardsApi([board])
    })
    const day = formatDay(localToday(), 'en')

    fireEvent.click(
      await screen.findByRole('button', { name: `Add a task due on ${day}` })
    )
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Create a task' })
    )
    expect(router.state.location.search).toBe(`?new=task&due=${localToday()}`)
    expect(dialog.getByRole('button', { name: 'Add details' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    fireEvent.click(dialog.getByRole('button', { name: 'Add details' }))
    expect(
      dialog.getByRole('button', { name: /^Due date: / })
    ).not.toHaveAccessibleName('Due date: No date')
    fireEvent.change(dialog.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Moodboard' }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(board.tasks).toContainEqual(
        expect.objectContaining({ title: 'Moodboard', dueDate: localToday() })
      )
    })
    expect(router.state.location.search).toBe('')
  })

  it('adds a task due on a day from a click on its empty part', async () => {
    const board = designBoard({ layout: 'calendar', defaultLayout: 'calendar' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    fireEvent.click(await todayCell())

    const dialog = within(
      await screen.findByRole('dialog', { name: 'Create a task' })
    )
    expect(dialog.getByRole('button', { name: 'Add details' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    fireEvent.click(dialog.getByRole('button', { name: 'Add details' }))
    expect(
      dialog.getByRole('button', { name: /^Due date: / })
    ).not.toHaveAccessibleName('Due date: No date')
  })

  it('opens a task rather than adding one when its chip in a day is clicked', async () => {
    const board = designBoard({ layout: 'calendar', defaultLayout: 'calendar' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })
    const today = await todayCell()

    fireEvent.click(within(today).getByRole('button', { name: 'Logo' }))

    expect(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    ).toBeVisible()
    expect(screen.queryByRole('dialog', { name: 'Create a task' })).toBe(null)
  })

  it('adds a task without a date from the + of No date', async () => {
    const board = designBoard({ layout: 'calendar', defaultLayout: 'calendar' })
    board.tasks = board.tasks.filter(task => task.dueDate !== null)
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Add a task without a date' })
    )

    const dialog = within(
      await screen.findByRole('dialog', { name: 'Create a task' })
    )
    expect(dialog.getByRole('button', { name: 'Add details' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  it('offers no way to add a task to a read only board', async () => {
    const board = designBoard({
      layout: 'calendar',
      defaultLayout: 'calendar',
      role: 'viewer'
    })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    await todayCell()
    expect(screen.queryByRole('button', { name: /^Add a task/ })).toBe(null)
  })

  it('offers no row to drag on a read only list', async () => {
    const board = designBoard({
      layout: 'list',
      defaultLayout: 'list',
      role: 'viewer'
    })
    const [todo] = board.sections
    board.tasks.push(aTask(todo ?? null, { key: 'DES-3', title: 'Icons' }))
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    await screen.findByRole('listitem', { name: 'DES-3 Icons' })
    for (const row of screen.getAllByRole('listitem')) {
      expect(row).not.toHaveAttribute('aria-roledescription')
    }
  })

  it('names the weekdays, marks today and comes back to it', async () => {
    const board = designBoard({ layout: 'calendar', defaultLayout: 'calendar' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const today = await todayCell()
    expect(today).toHaveAttribute('aria-current', 'date')
    expect(screen.queryAllByRole('region')).toEqual([])
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

  it.each([
    ['en', 'Sun'],
    ['fr', 'lun.']
  ] as const)(
    'starts the calendar weeks on the first day of the %s locale',
    async (lang, first) => {
      const board = designBoard({
        layout: 'calendar',
        defaultLayout: 'calendar'
      })
      renderRoute(`/boards/${board.id}`, {
        boardsApi: fakeBoardsApi([board]),
        lang
      })

      const header = (await screen.findByText(first)).parentElement
      expect(header?.firstElementChild).toHaveTextContent(first)
    }
  )

  it('opens a task from its day', async () => {
    const board = designBoard({ layout: 'calendar', defaultLayout: 'calendar' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const today = await todayCell()
    fireEvent.click(within(today).getByRole('button', { name: 'Logo' }))

    expect(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    ).toBeVisible()
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
