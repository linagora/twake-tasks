import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { findEmptyState } from '@/testing/emptyState'
import { renderRoute } from '@/testing/renderWithProviders'

async function aView() {
  const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
  design.tasks = [aTask(null, { key: 'DES-1', title: 'Logo', priority: 1 })]
  const boardsApi = fakeBoardsApi([design])
  const { id } = await boardsApi.createFilter({
    name: 'Urgent',
    criteria: { priorities: [1] },
    icon: 'Flag'
  })
  return { boardsApi, id }
}

describe('ViewScreen', () => {
  it('says so when the view does not exist, with a way back to the views', async () => {
    renderRoute('/filters/unknown', { boardsApi: fakeBoardsApi() })

    expect(
      await findEmptyState('This view doesn’t exist, or you can’t open it.')
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to views' })).toHaveAttribute(
      'href',
      '/filters'
    )
    expect(document.title).toContain('Page not found')
  })

  it('names the parent of a sub-task, in a list and on a board', async () => {
    const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
    const parent = aTask(null, { key: 'DES-1', title: 'Logo' })
    design.tasks = [
      parent,
      aTask(null, { key: 'DES-2', title: 'Sketch', parentId: parent.id })
    ]
    const boardsApi = fakeBoardsApi([design])
    const { id } = await boardsApi.createFilter({ name: 'All', criteria: {} })
    renderRoute(`/filters/${id}`, { boardsApi })

    expect(await screen.findByText('Sub-task of Logo')).toBeVisible()
    await boardsApi.updateFilter(id, {
      name: 'All',
      criteria: {},
      layout: 'board'
    })
    renderRoute(`/filters/${id}`, { boardsApi })
    expect(await screen.findByText('DES-2 · Sub-task of Logo')).toBeVisible()
  })

  it('opens the panel of a task of the view, on its own board', async () => {
    const { boardsApi, id } = await aView()
    renderRoute(`/filters/${id}`, { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))

    expect(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    ).toBeVisible()
  })

  it('names its criteria, their values in chips, folding the many', async () => {
    const { boardsApi, id } = await aView()
    await boardsApi.updateFilter(id, {
      name: 'Busy',
      criteria: {
        statuses: ['To do'],
        assignees: ['me'],
        labels: ['a', 'b', 'c'],
        priorities: [1]
      }
    })
    renderRoute(`/filters/${id}`, { boardsApi })

    const chips = within(await screen.findByRole('list', { name: 'Filters' }))
    const labels = within(chips.getByLabelText('Label: a or b or c'))
    expect(labels.getByText('Label')).toBeVisible()
    expect(labels.getByText('a')).toBeVisible()
    expect(labels.getByText('b')).toBeVisible()
    expect(labels.getByText('+1')).toBeVisible()
    expect(labels.queryByText('c')).toBeNull()
    expect(chips.queryByLabelText('Priority: P1')).toBeNull()
    fireEvent.click(chips.getByRole('button', { name: '+1 more' }))
    expect(chips.getByLabelText('Priority: P1')).toBeVisible()
  })

  it('draws its labels in the colour their board gives them', async () => {
    const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
    design.labels = [{ id: 'l1', name: 'client', color: '#E53935' }]
    const boardsApi = fakeBoardsApi([design])
    const { id } = await boardsApi.createFilter({
      name: 'Clients',
      criteria: { labels: ['client'] }
    })
    renderRoute(`/filters/${id}`, { boardsApi })

    const chips = within(await screen.findByRole('list', { name: 'Filters' }))
    await waitFor(() => {
      expect(chips.getByText('client').parentElement).toHaveStyle({
        backgroundColor: 'rgb(229, 57, 53)'
      })
    })
  })

  it('starts its breadcrumb from the list of views', async () => {
    const { boardsApi, id } = await aView()
    renderRoute(`/filters/${id}`, { boardsApi })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Urgent' })
    ).toBeVisible()
    const crumbs = within(
      screen.getByRole('navigation', { name: 'Where the page is' })
    )
    expect(crumbs.getByRole('link', { name: 'Views' })).toHaveAttribute(
      'href',
      '/filters'
    )
    expect(crumbs.getByText('Urgent')).toHaveAttribute('aria-current', 'page')
  })

  it('names the view in the breadcrumb of a task opened from it', async () => {
    const { boardsApi, id } = await aView()
    renderRoute(`/filters/${id}`, { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
    const panel = within(
      await screen.findByRole('dialog', { name: /^DES-1 Logo/ })
    )
    // A peek shows the task's own path: its full page, the way to it.
    fireEvent.click(panel.getByRole('button', { name: 'Open as full page' }))
    const crumbs = within(
      panel.getByRole('navigation', { name: 'Where the task is' })
    )
    expect(crumbs.getByRole('link', { name: 'Views' })).toHaveAttribute(
      'href',
      '/filters'
    )
    expect(crumbs.getByRole('link', { name: 'Urgent' })).toHaveAttribute(
      'href',
      `/filters/${id}`
    )
    expect(crumbs.getByText('DES-1')).toHaveAttribute('aria-current', 'page')
  })

  it('says its criteria by its name, since its cards leave them off', async () => {
    const { boardsApi, id } = await aView()
    renderRoute(`/filters/${id}`, { boardsApi })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Urgent' })
    ).toBeVisible()
    // Under the breadcrumb that titles the page, before its tasks.
    expect(screen.getByRole('main')).toHaveTextContent(/^Priority/)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('leaves Create task to the sidebar, with no button of its own', async () => {
    const boardsApi = fakeBoardsApi([aBoard({ name: 'Design' })])
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: {},
      layout: 'list'
    })
    renderRoute(`/filters/${id}`, { boardsApi })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Urgent' })
    ).toBeVisible()
    // The one of the sidebar only.
    expect(screen.getAllByRole('button', { name: 'Create task' })).toEqual([
      within(screen.getByRole('complementary')).getByRole('button', {
        name: 'Create task'
      })
    ])
    expect(screen.queryByRole('button', { name: 'Add task' })).toBe(null)
  })

  it('fills Create task of the sidebar in with its criteria, so the view shows the task', async () => {
    const inbox = aBoard({ name: 'Inbox', keyPrefix: 'INB', inbox: true })
    const boardsApi = fakeBoardsApi([inbox])
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: { priorities: [1] },
      layout: 'list'
    })
    renderRoute(`/filters/${id}`, { boardsApi })

    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(
      within(screen.getByRole('complementary')).getByRole('button', {
        name: 'Create task'
      })
    )
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByRole('heading', { name: 'Create a task' })).toBeVisible()
    expect(
      await dialog.findByRole('combobox', { name: 'Priority' })
    ).toHaveTextContent('P1')
    fireEvent.change(dialog.getByLabelText('Title'), {
      target: { value: 'Call the printer' }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('Call the printer')).toBeVisible()
    expect(boardsApi.createTask).toHaveBeenCalledWith(
      inbox.id,
      expect.objectContaining({ title: 'Call the printer' })
    )
    expect(boardsApi.editTask).toHaveBeenCalledWith(
      inbox.id,
      expect.any(String),
      { priority: 1 }
    )
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBe(null)
    })
  })

  it('gives a new task me, and makes the label and status of the view its board lacks', async () => {
    const design = aBoard({
      name: 'Design',
      members: [
        // The fake API knows the signed-in person as `me`.
        { userId: 'me', email: 'alice@example.com', name: 'Alice' }
      ]
    })
    const boardsApi = fakeBoardsApi([design])
    const { id } = await boardsApi.createFilter({
      name: 'Review',
      criteria: {
        assignees: ['me'],
        labels: ['Print'],
        statuses: ['In review'],
        boards: [design.id]
      },
      layout: 'list'
    })
    renderRoute(`/filters/${id}`, { boardsApi })

    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(
      within(screen.getByRole('complementary')).getByRole('button', {
        name: 'Create task'
      })
    )
    const dialog = within(await screen.findByRole('dialog'))
    expect(
      await dialog.findByRole('combobox', { name: 'Section' })
    ).toHaveTextContent('In review')
    expect(dialog.getByText('Alice')).toBeVisible()
    expect(dialog.getByText('Print')).toBeVisible()
    fireEvent.change(dialog.getByLabelText('Title'), {
      target: { value: 'Call the printer' }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('Call the printer')).toBeVisible()
    expect(boardsApi.createSection).toHaveBeenCalledWith(
      design.id,
      expect.objectContaining({ name: 'In review' })
    )
    expect(boardsApi.createLabel).toHaveBeenCalledWith(design.id, {
      name: 'Print'
    })
    expect(boardsApi.setAssignees).toHaveBeenCalledWith(
      design.id,
      expect.any(String),
      ['me']
    )
  })

  it('offers to create a task when nothing matches', async () => {
    const boardsApi = fakeBoardsApi([
      aBoard({ name: 'Inbox', keyPrefix: 'INB', inbox: true })
    ])
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: { priorities: [1] },
      layout: 'list'
    })
    renderRoute(`/filters/${id}`, { boardsApi })

    const empty = (
      await screen.findByText('No open task matches this filter')
    ).closest('[role="status"]')
    if (!(empty instanceof HTMLElement)) throw new Error('No empty state')
    fireEvent.click(within(empty).getByRole('button', { name: 'Add task' }))
    expect(await screen.findByRole('dialog')).toBeVisible()
  })

  it('names the board of a task in a column of its list, not among its labels', async () => {
    const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
    design.tasks = [
      aTask(null, {
        key: 'DES-1',
        title: 'Logo',
        priority: 1,
        labels: [{ id: 'l1', name: 'client', color: null }]
      })
    ]
    const boardsApi = fakeBoardsApi([design])
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: { priorities: [1] },
      layout: 'list'
    })
    renderRoute(`/filters/${id}`, { boardsApi })

    const row = await screen.findByRole('listitem', { name: 'DES-1 Logo' })
    expect(screen.getByText('Board')).toBeInTheDocument()
    const labels = row.lastElementChild?.lastElementChild
    expect(labels).toHaveTextContent('client')
    expect(labels).not.toHaveTextContent('Design')
    expect(row).toHaveTextContent('Design')
  })

  it('keeps the board column in a list grouped by board', async () => {
    const { boardsApi, id } = await aView()
    await boardsApi.updateFilter(id, {
      name: 'Urgent',
      criteria: { priorities: [1] },
      layout: 'list',
      groupBy: 'board'
    })
    renderRoute(`/filters/${id}`, { boardsApi })

    expect(
      await screen.findByRole('listitem', { name: 'DES-1 Logo' })
    ).toBeVisible()
    expect(screen.getByText('Board')).toBeInTheDocument()
  })

  it('shows its tasks in the layout chosen for it, with no switch', async () => {
    const { boardsApi, id } = await aView()
    await boardsApi.updateFilter(id, {
      name: 'Urgent',
      criteria: { priorities: [1] },
      icon: 'Flag',
      layout: 'board'
    })
    renderRoute(`/filters/${id}`, { boardsApi })

    expect(
      await screen.findByRole('region', { name: /No section/ })
    ).toHaveTextContent('Logo')
    expect(screen.queryByRole('button', { name: 'Calendar' })).toBeNull()
  })

  it('merges the sections of its boards, those with a task first', async () => {
    const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
    const site = aBoard({ name: 'Site', keyPrefix: 'SIT' })
    const [designToDo] = design.sections
    const [siteToDo] = site.sections
    design.tasks = [
      aTask(designToDo ?? null, { key: 'DES-1', title: 'Logo', priority: 1 })
    ]
    site.tasks = [
      aTask(siteToDo ?? null, { key: 'SIT-1', title: 'Home page', priority: 1 })
    ]
    const boardsApi = fakeBoardsApi([design, site])
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: { priorities: [1] },
      layout: 'board'
    })
    renderRoute(`/filters/${id}`, { boardsApi })

    const toDo = await screen.findByRole('region', { name: /To do/ })
    expect(toDo).toHaveTextContent('Logo')
    expect(toDo).toHaveTextContent('Home page')
    expect(toDo).toHaveTextContent('Design')
    expect(toDo).toHaveTextContent('Site')
    expect(screen.getAllByRole('region')).toHaveLength(1)
    expect(
      screen.queryByRole('button', { name: 'Show all columns' })
    ).toBeNull()
  })

  it('shows its columns of no task when its settings say so', async () => {
    const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
    const [toDo] = design.sections
    design.tasks = [aTask(toDo ?? null, { key: 'DES-1', title: 'Logo' })]
    const boardsApi = fakeBoardsApi([design])
    const { id } = await boardsApi.createFilter({
      name: 'All',
      criteria: {},
      layout: 'board',
      allColumns: true
    })
    renderRoute(`/filters/${id}`, { boardsApi })

    expect(
      await screen.findByRole('region', { name: /In progress/ })
    ).toBeVisible()
    expect(screen.getAllByRole('region')).toHaveLength(3)
  })

  it('stars and unstars itself from where its menu shows it', async () => {
    const { boardsApi, id } = await aView()
    renderRoute(`/filters/${id}`, { boardsApi })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Actions of Urgent' })
    )
    expect(screen.queryByRole('menuitem', { name: /favorites/ })).toBe(null)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    const place = async (where: string) => {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Actions of Urgent' })
      )
      fireEvent.click(
        await screen.findByRole('menuitem', { name: 'Show in the sidebar' })
      )
      const places = within(
        await screen.findByRole('menu', { name: 'Show in the sidebar' })
      )
      fireEvent.click(places.getByRole('menuitemradio', { name: where }))
      await waitFor(() => {
        expect(screen.queryByRole('menu')).toBe(null)
      })
    }

    await place('Favorites')
    expect(boardsApi.setFilterFavorite).toHaveBeenCalledWith(id, true)
    await place('Not in the sidebar')
    expect(boardsApi.setFilterFavorite).toHaveBeenCalledWith(id, false)
  })

  it('shows itself in a section named in its menu', async () => {
    const { boardsApi, id } = await aView()
    renderRoute(`/filters/${id}`, { boardsApi })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Actions of Urgent' })
    )
    fireEvent.mouseEnter(
      await screen.findByRole('menuitem', { name: 'Show in the sidebar' })
    )
    const places = within(
      await screen.findByRole('menu', { name: 'Show in the sidebar' })
    )
    fireEvent.click(places.getByRole('menuitem', { name: 'New section' }))
    fireEvent.change(places.getByRole('textbox', { name: /^Name/ }), {
      target: { value: 'Reading' }
    })
    fireEvent.click(places.getByRole('button', { name: 'Create' }))

    const reading = within(await screen.findByRole('list', { name: 'Reading' }))
    expect(reading.getByRole('link', { name: 'Urgent' })).toBeVisible()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens its edit page', async () => {
    const { boardsApi, id } = await aView()
    renderRoute(`/filters/${id}`, { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Actions of Urgent' })
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit view' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Edit view' })
    ).toBeVisible()
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Urgent')
  })

  it('offers the board as a filter of the view', async () => {
    const { boardsApi, id } = await aView()
    renderRoute(`/filters/${id}/edit`, { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'Add filter' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Board' }))
    expect(
      await screen.findByRole('menuitemcheckbox', { name: 'Design' })
    ).toHaveAttribute('aria-checked', 'false')
  })

  it('adds a task at the foot of a column, in that section', async () => {
    const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
    const inbox = aBoard({ name: 'Inbox', keyPrefix: 'INB', inbox: true })
    design.tasks = [
      aTask(design.sections[1] ?? null, {
        key: 'DES-1',
        title: 'Logo',
        priority: 1
      })
    ]
    const boardsApi = fakeBoardsApi([design, inbox])
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: { priorities: [1] },
      layout: 'board'
    })
    renderRoute(`/filters/${id}`, { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Add a task to In progress' })
    )
    fireEvent.change(screen.getByLabelText('Task title'), {
      target: { value: 'Poster' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(boardsApi.createTask).toHaveBeenCalledWith(inbox.id, {
        title: 'Poster',
        sectionId: inbox.sections[1]?.id
      })
    })
    expect(
      await within(
        screen.getByRole('region', { name: /In progress/ })
      ).findByText('Poster')
    ).toBeVisible()
  })

  it('adds a task on a day of its calendar', async () => {
    const { boardsApi, id } = await aView()
    await boardsApi.updateFilter(id, {
      name: 'Urgent',
      criteria: { priorities: [1] },
      layout: 'calendar'
    })
    renderRoute(`/filters/${id}`, { boardsApi })

    const days = await screen.findAllByRole('button', {
      name: /^Add a task due on/
    })
    const [, , , , , , , , , , day] = days
    if (!day) throw new Error('no day')
    fireEvent.click(day)
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Title'), {
      target: { value: 'Call the printer' }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(boardsApi.editTask).toHaveBeenCalled()
    })
    const changes = boardsApi.editTask.mock.calls[0]?.[2]
    expect(changes?.priority).toBe(1)
    expect(changes?.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('shows every field of its tasks, the one it groups by too', async () => {
    const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
    design.tasks = [
      aTask(null, {
        key: 'DES-1',
        title: 'Logo',
        priority: 1,
        labels: [
          { id: 'l1', name: 'design', color: null },
          { id: 'l2', name: 'client', color: null }
        ]
      })
    ]
    const boardsApi = fakeBoardsApi([design])
    const { id } = await boardsApi.createFilter({
      name: 'Design',
      criteria: { labels: ['Design'], priorities: [1] },
      layout: 'board',
      groupBy: 'label'
    })
    renderRoute(`/filters/${id}`, { boardsApi })

    const client = await screen.findByRole('region', { name: 'client' })
    expect(client).toHaveTextContent('design')
    // The column's title names its label, which its cards show as well.
    expect(within(client).getAllByText('client')).toHaveLength(2)
    expect(client).toHaveTextContent('P1')
    const design1 = screen.getByRole('region', { name: 'design' })
    expect(design1).toHaveTextContent('client')
    expect(design1).toHaveTextContent('Design')
  })

  it('goes back from its edit page to the view, with no breadcrumb', async () => {
    const { boardsApi, id } = await aView()
    renderRoute(`/filters/${id}/edit`, { boardsApi })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Edit view' })
    ).toBeVisible()
    expect(
      screen.queryByRole('navigation', { name: 'Where the page is' })
    ).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Back' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Urgent' })
    ).toBeVisible()
  })

  it('goes back from its edit page to the view it was opened from', async () => {
    const { boardsApi, id } = await aView()
    const { router } = renderRoute(`/filters/${id}`, { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Actions of Urgent' })
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit view' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Edit view' })
    ).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'Back' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Urgent' })
    ).toBeVisible()
    expect(router.state.location.pathname).toBe(`/filters/${id}`)
  })

  it('starts the breadcrumb of my tasks from My tasks', async () => {
    renderRoute('/mine', { boardsApi: fakeBoardsApi() })

    const crumbs = within(
      await screen.findByRole('navigation', { name: 'Where the page is' })
    )
    expect(crumbs.getByText('My tasks')).toHaveAttribute('aria-current', 'page')
  })

  it('shows my tasks as a view, in the layout I pick', async () => {
    const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
    const me = { userId: 'me', email: 'me@example.com', name: null }
    design.tasks = [
      aTask(design.sections[1] ?? null, {
        key: 'DES-1',
        title: 'Logo',
        assignees: [me]
      })
    ]
    const boardsApi = fakeBoardsApi([design])
    renderRoute('/mine', { boardsApi })

    expect(await screen.findByText('Logo')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Board' }))
    expect(
      await screen.findByRole('region', { name: /In progress/ })
    ).toHaveTextContent('Logo')
    expect(
      screen.getByRole('button', { name: 'Add a task to In progress' })
    ).toBeVisible()
  })
})
