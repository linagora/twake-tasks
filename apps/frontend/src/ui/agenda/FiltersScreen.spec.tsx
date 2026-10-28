import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { findEmptyState } from '@/testing/emptyState'
import { renderRoute } from '@/testing/renderWithProviders'
import { localZone } from '@/ui/boards/dueLabel'

function boards() {
  const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
  const client = { id: 'l1', name: 'client', color: null }
  const internal = { id: 'l2', name: 'internal', color: null }
  design.labels = [client, internal]
  design.tasks = [
    aTask(null, { key: 'DES-1', title: 'Logo', priority: 1, labels: [client] }),
    aTask(null, { key: 'DES-2', title: 'Poster', priority: 1 }),
    aTask(null, { key: 'DES-3', title: 'Flyer' }),
    aTask(null, {
      key: 'DES-4',
      title: 'Banner',
      priority: 2,
      labels: [internal]
    })
  ]
  return fakeBoardsApi([design])
}

async function pick(criterion: string, ...options: string[]) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: criterion }))
  const list = await screen.findByRole('listbox', { name: criterion })
  for (const option of options) {
    fireEvent.click(await within(list).findByRole('option', { name: option }))
  }
  fireEvent.keyDown(list, { key: 'Escape' })
  await waitFor(() => {
    expect(screen.queryByRole('listbox')).toBeNull()
  })
}

describe('FiltersScreen', () => {
  it('titles the page with its breadcrumb, with no title repeating it', async () => {
    renderRoute('/filters', { boardsApi: fakeBoardsApi() })

    const crumbs = within(
      await screen.findByRole('navigation', { name: 'Where the page is' })
    )
    expect(
      crumbs.getByRole('heading', { level: 1, name: 'Filters' })
    ).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('keeps each select label clear of its value', async () => {
    renderRoute('/filters', { boardsApi: boards() })

    fireEvent.click(await screen.findByRole('button', { name: 'New filter' }))
    for (const name of ['Assignee', 'Priority', 'Label', 'Due']) {
      const field = await screen.findByRole('combobox', { name })
      expect(field).toHaveTextContent('Any')
      expect(
        document.getElementById(field.getAttribute('aria-labelledby') ?? '')
      ).toHaveAttribute('data-shrink', 'true')
    }
  })

  it('saves a filter and opens its tasks', async () => {
    const boardsApi = boards()
    renderRoute('/filters', { boardsApi })

    expect(screen.queryByLabelText('Name')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'New filter' }))
    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Client fires' }
    })
    await pick('Priority', 'P1', 'P2')
    await pick('Label', 'client', 'internal')
    expect(
      screen.getByRole('combobox', { name: 'Priority' })
    ).toHaveTextContent('P1 or P2')
    fireEvent.click(screen.getByRole('button', { name: 'Save filter' }))
    fireEvent.click(await screen.findByRole('link', { name: 'Client fires' }))

    expect(
      await screen.findByRole('heading', { name: 'Client fires' })
    ).toBeVisible()
    expect(await screen.findByText('Logo')).toBeVisible()
    expect(screen.getByText('Banner')).toBeVisible()
    expect(screen.queryByText('Poster')).not.toBeInTheDocument()
    expect(boardsApi.createFilter).toHaveBeenCalledWith({
      name: 'Client fires',
      criteria: { priority: [1, 2], label: ['client', 'internal'] }
    })
    expect(boardsApi.filteredTasks).toHaveBeenCalledWith(
      expect.any(String),
      localZone()
    )
  })

  it('moves the focus to Name on New filter, then to the saved filter', async () => {
    renderRoute('/filters', { boardsApi: boards() })

    fireEvent.click(await screen.findByRole('button', { name: 'New filter' }))
    const name = await screen.findByLabelText('Name')
    expect(name).toHaveFocus()
    fireEvent.change(name, { target: { value: 'Client fires' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save filter' }))

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Client fires' })).toHaveFocus()
    })
  })

  it('gives the focus back to the button that opened the form on Cancel', async () => {
    const boardsApi = boards()
    await boardsApi.createFilter({ name: 'Design work', criteria: {} })
    renderRoute('/filters', { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'New filter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'New filter' })).toHaveFocus()

    const edit = await screen.findByRole('button', { name: 'Edit Design work' })
    fireEvent.click(edit)
    expect(screen.getByLabelText('Name')).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(edit).toHaveFocus()
  })

  it('shows the tasks as a board, one column per status kind', async () => {
    const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
    const [todo, doing] = design.sections
    design.tasks = [
      aTask(doing ?? null, { key: 'DES-1', title: 'Logo' }),
      aTask(null, { key: 'DES-2', title: 'Poster' }),
      aTask(todo ?? null, { key: 'DES-3', title: 'Flyer' })
    ]
    const boardsApi = fakeBoardsApi([design])
    const { id } = await boardsApi.createFilter({ name: 'All', criteria: {} })
    const { unmount } = renderRoute(`/filters/${id}`, { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'Kanban' }))

    const started = within(screen.getByRole('region', { name: 'In progress' }))
    expect(started.getByRole('button', { name: 'Logo' })).toBeVisible()
    expect(started.getByText('DES-1 · Design')).toBeVisible()
    const unstarted = within(screen.getByRole('region', { name: 'To do' }))
    expect(unstarted.getByText('Poster')).toBeVisible()
    expect(unstarted.getByText('Flyer')).toBeVisible()

    unmount()
    renderRoute(`/filters/${id}`, { boardsApi })
    expect(
      await screen.findByRole('region', { name: 'In progress' })
    ).toBeVisible()
  })

  it('names the parent of a sub-task', async () => {
    const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
    const parent = aTask(null, { key: 'DES-1', title: 'Logo' })
    design.tasks = [
      parent,
      aTask(null, { key: 'DES-2', title: 'Sketch', parentId: parent.id })
    ]
    const boardsApi = fakeBoardsApi([design])
    const { id } = await boardsApi.createFilter({ name: 'All', criteria: {} })
    renderRoute(`/filters/${id}`, { boardsApi })

    expect(await screen.findByText('Logo')).toBeVisible()
    expect(screen.getByText('DES-2 · Design · Sub-task of Logo')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Kanban' }))
    expect(screen.getByText('DES-2 · Design · Sub-task of Logo')).toBeVisible()
  })

  it('says when no open task matches the filter', async () => {
    const boardsApi = fakeBoardsApi()
    const { id } = await boardsApi.createFilter({ name: 'All', criteria: {} })
    renderRoute(`/filters/${id}`, { boardsApi })

    expect(
      await findEmptyState('No open task matches this filter')
    ).toBeVisible()
    expect(screen.queryByText('You are all caught up.')).toBeNull()
  })

  it('says so when the filter does not exist, with a way back to the filters', async () => {
    renderRoute('/filters/unknown', { boardsApi: boards() })

    expect(
      await findEmptyState("This filter doesn't exist, or you can't open it.")
    ).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Back to filters' })
    ).toHaveAttribute('href', '/filters')
    expect(document.title).toContain('Page not found')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kanban' })).toBeNull()
  })

  it('sums up what each saved filter looks for', async () => {
    const boardsApi = boards()
    await boardsApi.createFilter({
      name: 'Client fires',
      criteria: {
        priority: [1],
        label: ['client'],
        due: ['overdue', 'today', 'week']
      }
    })
    await boardsApi.createFilter({ name: 'Everything', criteria: {} })
    renderRoute('/filters', { boardsApi })

    expect(
      await screen.findByRole('listitem', { name: 'Client fires' })
    ).toHaveTextContent(
      'Priority: P1 · Label: client · Due: Overdue, Today, or Next 7 days'
    )
    expect(
      screen.getByRole('listitem', { name: 'Everything' })
    ).toHaveTextContent('All tasks')
  })

  it('filters on other people, found by name', async () => {
    const bob = {
      userId: 'bob',
      email: 'bob.durand@example.com',
      name: 'Bob Durand'
    }
    const chloe = { userId: 'chloe', email: 'chloe@example.com', name: null }
    const boardsApi = fakeBoardsApi([
      aBoard({ members: [bob, chloe] }),
      aBoard({ members: [bob] })
    ])
    renderRoute('/filters', { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'New filter' }))
    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Team' }
    })
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Assignee' }))
    const picker = within(
      await screen.findByRole('dialog', { name: 'Assignee' })
    )
    await waitFor(() => {
      expect(picker.getAllByRole('menuitemcheckbox')).toHaveLength(4)
    })
    const rows = picker.getAllByRole('menuitemcheckbox')
    expect(rows[0]).toHaveAccessibleName('Me')
    expect(rows[1]).toHaveAccessibleName('Nobody')
    expect(rows[2]).toHaveAccessibleName('Bob Durand bob.durand@example.com')
    expect(rows[3]).toHaveAccessibleName('chloe@example.com')
    fireEvent.click(picker.getByRole('menuitemcheckbox', { name: 'Me' }))
    const search = picker.getByRole('textbox', { name: 'Search people' })
    fireEvent.change(search, { target: { value: 'alice' } })
    expect(picker.getAllByRole('menuitemcheckbox')).toHaveLength(1)
    expect(picker.getByRole('menuitemcheckbox')).toHaveAccessibleName('Me')
    fireEvent.change(search, { target: { value: 'bo' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(
      screen.getByRole('combobox', { name: 'Assignee' })
    ).toHaveTextContent('Me or Bob Durand')
    fireEvent.click(screen.getByRole('button', { name: 'Save filter' }))

    expect(
      await screen.findByRole('listitem', { name: 'Team' })
    ).toHaveTextContent('Assignee: Me or Bob Durand')
    expect(boardsApi.createFilter).toHaveBeenCalledWith({
      name: 'Team',
      criteria: { assignee: ['me', 'bob'] }
    })
  })

  it('names someone no longer on my boards, who can still be unpicked', async () => {
    const boardsApi = fakeBoardsApi()
    await boardsApi.createFilter({
      name: 'Gone',
      criteria: { assignee: ['nobody', 'zoe'] }
    })
    renderRoute('/filters', { boardsApi })

    expect(
      await screen.findByRole('listitem', { name: 'Gone' })
    ).toHaveTextContent('Assignee: Nobody or Someone no longer on your boards')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Gone' }))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Assignee' }))
    fireEvent.click(
      await screen.findByRole('menuitemcheckbox', {
        name: 'Someone no longer on your boards'
      })
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Save filter' }))

    await waitFor(() => {
      expect(boardsApi.updateFilter).toHaveBeenCalledWith(expect.any(String), {
        name: 'Gone',
        criteria: { assignee: ['nobody'] }
      })
    })
  })

  it('pins a filter to the sidebar, and unpins it, keeping the focus on the star', async () => {
    const boardsApi = boards()
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: { priority: [1] }
    })
    renderRoute('/filters', { boardsApi })

    const star = await screen.findByRole('button', {
      name: 'Pin Urgent to the sidebar'
    })
    star.focus()
    fireEvent.click(star)
    const unstar = await screen.findByRole('button', {
      name: 'Unpin Urgent from the sidebar'
    })
    expect(unstar).toHaveFocus()
    expect(boardsApi.setFilterFavorite).toHaveBeenCalledWith(id, true)

    fireEvent.click(unstar)
    expect(
      await screen.findByRole('button', { name: 'Pin Urgent to the sidebar' })
    ).toHaveFocus()
    expect(boardsApi.setFilterFavorite).toHaveBeenLastCalledWith(id, false)
  })

  it('takes a pinned filter out of the sidebar while its deletion can be undone', async () => {
    const boardsApi = boards()
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: { priority: [1] }
    })
    await boardsApi.setFilterFavorite(id, true)
    renderRoute('/filters', { boardsApi })
    const nav = within(await screen.findByRole('list', { name: 'Main menu' }))
    await nav.findByRole('link', { name: 'Urgent' })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Urgent' }))
    await waitFor(() => {
      expect(nav.queryByRole('link', { name: 'Urgent' })).toBeNull()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(await nav.findByRole('link', { name: 'Urgent' })).toBeVisible()
  })

  it('edits a saved filter in place', async () => {
    const boardsApi = boards()
    const { id } = await boardsApi.createFilter({
      name: 'Design work',
      criteria: { label: ['client'] }
    })
    renderRoute('/filters', { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit Design work' })
    )
    expect(screen.getByRole('heading', { name: 'Edit filter' })).toBeVisible()
    const name = screen.getByLabelText('Name')
    expect(name).toHaveValue('Design work')
    expect(screen.getByRole('combobox', { name: 'Label' })).toHaveTextContent(
      'client'
    )
    fireEvent.change(name, { target: { value: 'Internal fires' } })
    await pick('Priority', 'P1', 'P3')
    await pick('Label', 'client', 'internal')
    fireEvent.click(screen.getByRole('button', { name: 'Save filter' }))

    expect(
      await screen.findByRole('listitem', { name: 'Internal fires' })
    ).toHaveTextContent('Priority: P1 or P3 · Label: internal')
    expect(screen.queryByRole('heading', { name: 'Edit filter' })).toBeNull()
    expect(boardsApi.updateFilter).toHaveBeenCalledWith(id, {
      name: 'Internal fires',
      criteria: { priority: [1, 3], label: ['internal'] }
    })
  })

  it('looks for any task again once every value of a criterion is unpicked', async () => {
    const boardsApi = boards()
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: { priority: [1] }
    })
    renderRoute('/filters', { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Urgent' }))
    await pick('Priority', 'P1')
    expect(
      screen.getByRole('combobox', { name: 'Priority' })
    ).toHaveTextContent('Any')
    fireEvent.click(screen.getByRole('button', { name: 'Save filter' }))

    expect(
      await screen.findByRole('listitem', { name: 'Urgent' })
    ).toHaveTextContent('All tasks')
    expect(boardsApi.updateFilter).toHaveBeenCalledWith(id, {
      name: 'Urgent',
      criteria: {}
    })
  })

  it('edits a filter from its page and lists what now matches', async () => {
    const boardsApi = boards()
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: { priority: [1] }
    })
    renderRoute(`/filters/${id}`, { boardsApi })

    expect(await screen.findByText('Poster')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Edit filter' }))
    await pick('Label', 'client')
    fireEvent.click(screen.getByRole('button', { name: 'Save filter' }))

    await waitFor(() => {
      expect(screen.queryByText('Poster')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Logo')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Edit filter' })).toBeNull()
  })

  it('deletes a filter once its undo notice closes', async () => {
    const boardsApi = boards()
    await boardsApi.createFilter({
      name: 'Urgent',
      criteria: { priority: [1] }
    })
    renderRoute('/filters', { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete Urgent' })
    )

    expect(await findEmptyState('No saved filters')).toHaveTextContent(
      'Save the criteria you look for often, like your P1 tasks.'
    )
    expect(screen.getByText('Urgent deleted')).toBeVisible()
    expect(boardsApi.deleteFilter).not.toHaveBeenCalled()
    expect(
      screen
        .getByRole('list', { name: 'Main menu' })
        .querySelector('a[href="/filters"]')
    ).not.toBeNull()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(boardsApi.deleteFilter).toHaveBeenCalledTimes(1)
    })
    expect(await boardsApi.listFilters()).toEqual([])
  })

  it('brings a deleted filter back on undo', async () => {
    const boardsApi = boards()
    await boardsApi.createFilter({
      name: 'Urgent',
      criteria: { priority: [1] }
    })
    await boardsApi.createFilter({
      name: 'Mine',
      criteria: { assignee: ['me'] }
    })
    renderRoute('/filters', { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete Urgent' })
    )
    expect(screen.queryByRole('listitem', { name: 'Urgent' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(
      within(screen.getByRole('region', { name: 'Saved filters' }))
        .getAllByRole('listitem')
        .map(item => item.getAttribute('aria-label'))
    ).toEqual(['Urgent', 'Mine'])
    expect(screen.queryByText('Urgent deleted')).toBeNull()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(boardsApi.deleteFilter).not.toHaveBeenCalled()
  })

  it('deletes a filter whose notice is still open when the page is left', async () => {
    const boardsApi = boards()
    await boardsApi.createFilter({
      name: 'Urgent',
      criteria: { priority: [1] }
    })
    const { unmount } = renderRoute('/filters', { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete Urgent' })
    )
    unmount()

    await waitFor(() => {
      expect(boardsApi.deleteFilter).toHaveBeenCalledTimes(1)
    })
  })

  it('deletes a filter whose notice is still open when the page unloads', async () => {
    const boardsApi = boards()
    await boardsApi.createFilter({
      name: 'Urgent',
      criteria: { priority: [1] }
    })
    const { unmount } = renderRoute('/filters', { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete Urgent' })
    )
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(boardsApi.deleteFilter).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    })
    unmount()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(boardsApi.deleteFilter).toHaveBeenCalledTimes(1)
  })
})
