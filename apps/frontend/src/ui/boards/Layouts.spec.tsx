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

  it('sorts each section by a column, up, down, then back to its order', async () => {
    const board = designBoard({ layout: 'list', defaultLayout: 'list' })
    const [todo] = board.sections
    board.tasks = [
      aTask(todo ?? null, { key: 'DES-1', title: 'Logo', priority: 3 }),
      aTask(todo ?? null, { key: 'DES-2', title: 'Banner', priority: 1 }),
      aTask(todo ?? null, { key: 'DES-3', title: 'Flyer' })
    ]
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })
    const order = () =>
      within(screen.getByRole('list', { name: 'To do' }))
        .getAllByRole('listitem')
        .map(row => row.getAttribute('aria-label'))

    const priority = await screen.findByRole('button', {
      name: 'Sort by Priority'
    })
    fireEvent.click(priority)
    expect(order()).toEqual(['DES-2 Banner', 'DES-1 Logo', 'DES-3 Flyer'])

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Priority, sorted A to Z: sort Z to A'
      })
    )
    // The tasks without a priority stay last.
    expect(order()).toEqual(['DES-1 Logo', 'DES-2 Banner', 'DES-3 Flyer'])

    fireEvent.click(
      screen.getByRole('button', {
        name: "Priority, sorted Z to A: back to the board's order"
      })
    )
    expect(order()).toEqual(['DES-1 Logo', 'DES-2 Banner', 'DES-3 Flyer'])
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Task' }))
    expect(order()).toEqual(['DES-2 Banner', 'DES-3 Flyer', 'DES-1 Logo'])
  })

  it("changes a priority from its cell, with the panel's choices", async () => {
    const board = designBoard({ layout: 'list', defaultLayout: 'list' })
    Object.assign(board.tasks[0] ?? {}, { priority: 3 })
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Change Priority of DES-1' })
    )
    const menu = within(await screen.findByRole('menu', { name: 'Priority' }))
    expect(
      menu.getAllByRole('menuitem').map(item => item.getAttribute('aria-label'))
    ).toEqual(['None', 'Priority 1', 'Priority 2', 'Priority 3', 'Priority 4'])
    fireEvent.click(menu.getByRole('menuitem', { name: 'Priority 2' }))

    await waitFor(() => {
      expect(boardsApi.editTask).toHaveBeenCalledWith(
        board.id,
        board.tasks[0]?.id,
        { priority: 2 }
      )
    })
    expect(
      within(
        await screen.findByRole('listitem', { name: 'DES-1 Logo' })
      ).getByLabelText('Priority 2')
    ).toBeVisible()
  })

  it("opens the panel's pickers from the other cells", async () => {
    const board = designBoard({ layout: 'list', defaultLayout: 'list' })
    const ann = { userId: 'ann', email: 'ann@example.com', name: 'Ann Lee' }
    board.members = [ann]
    Object.assign(board.tasks[0] ?? {}, {
      assignees: [ann],
      labels: [{ id: 'urgent', name: 'Urgent', color: null }]
    })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Change Assignees of DES-1' })
    )
    expect(
      await screen.findByRole('dialog', { name: 'Assign DES-1' })
    ).toBeVisible()
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape'
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Change Labels of DES-1' })
    )
    expect(
      await screen.findByRole('dialog', { name: 'Labels of DES-1' })
    ).toBeVisible()
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape'
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Change Due of DES-1' })
    )
    expect(await screen.findByRole('dialog', { name: 'Dates' })).toBeVisible()
  })

  it('leaves the cells as they are to a viewer', async () => {
    const board = designBoard({
      layout: 'list',
      defaultLayout: 'list',
      role: 'viewer'
    })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    await screen.findByRole('listitem', { name: 'DES-1 Logo' })
    expect(screen.queryByRole('button', { name: /^Change / })).toBeNull()
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

    fireEvent.click(
      await screen.findByRole('region', {
        name: formatDay(localToday(), 'en')
      })
    )

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
    const today = await screen.findByRole('region', {
      name: formatDay(localToday(), 'en')
    })

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

    await screen.findByRole('region', { name: formatDay(localToday(), 'en') })
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

      await screen.findByRole('region', {
        name: formatDay(localToday(), lang)
      })
      const header = screen.getByText(first).parentElement
      expect(header?.firstElementChild).toHaveTextContent(first)
    }
  )

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
