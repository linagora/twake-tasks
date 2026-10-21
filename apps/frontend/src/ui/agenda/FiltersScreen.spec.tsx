import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { findEmptyState } from '@/testing/emptyState'
import { renderRoute } from '@/testing/renderWithProviders'
import { localZone } from '@/ui/boards/dueLabel'

function boards() {
  const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
  design.labels = [{ id: 'l1', name: 'client', color: null }]
  design.tasks = [
    aTask(null, {
      key: 'DES-1',
      title: 'Logo',
      priority: 1,
      labels: [{ id: 'l1', name: 'client', color: null }]
    }),
    aTask(null, { key: 'DES-2', title: 'Poster', priority: 1 }),
    aTask(null, { key: 'DES-3', title: 'Flyer' })
  ]
  return fakeBoardsApi([design])
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
      expect(
        await screen.findByText(name, { selector: 'label' })
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
    fireEvent.change(screen.getByRole('combobox', { name: 'Priority' }), {
      target: { value: '1' }
    })
    const label = screen.getByRole('combobox', { name: 'Label' })
    await within(label).findByRole('option', { name: 'client' })
    fireEvent.change(label, { target: { value: 'client' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save filter' }))
    fireEvent.click(await screen.findByRole('link', { name: 'Client fires' }))

    expect(
      await screen.findByRole('heading', { name: 'Client fires' })
    ).toBeVisible()
    expect(await screen.findByText('Logo')).toBeVisible()
    expect(screen.queryByText('Poster')).not.toBeInTheDocument()
    expect(boardsApi.createFilter).toHaveBeenCalledWith({
      name: 'Client fires',
      criteria: { priority: 1, label: 'client' }
    })
    expect(boardsApi.filteredTasks).toHaveBeenCalledWith(
      expect.any(String),
      localZone()
    )
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

    fireEvent.click(await screen.findByRole('button', { name: 'Board' }))

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
    fireEvent.click(screen.getByRole('button', { name: 'Board' }))
    expect(screen.getByText('DES-2 · Design · Sub-task of Logo')).toBeVisible()
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
    expect(screen.queryByRole('button', { name: 'Board' })).toBeNull()
  })

  it('sums up what each saved filter looks for', async () => {
    const boardsApi = boards()
    await boardsApi.createFilter({
      name: 'Client fires',
      criteria: { priority: 1, label: 'client' }
    })
    await boardsApi.createFilter({ name: 'Everything', criteria: {} })
    renderRoute('/filters', { boardsApi })

    expect(
      await screen.findByRole('listitem', { name: 'Client fires' })
    ).toHaveTextContent('Priority: P1 · Label: client')
    expect(
      screen.getByRole('listitem', { name: 'Everything' })
    ).toHaveTextContent('All tasks')
  })

  it('edits a saved filter in place', async () => {
    const boardsApi = boards()
    const { id } = await boardsApi.createFilter({
      name: 'Design work',
      criteria: { label: 'client' }
    })
    renderRoute('/filters', { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit Design work' })
    )
    expect(screen.getByRole('heading', { name: 'Edit filter' })).toBeVisible()
    const name = screen.getByLabelText('Name')
    expect(name).toHaveValue('Design work')
    const label = screen.getByRole('combobox', { name: 'Label' })
    await within(label).findByRole('option', { name: 'client' })
    expect(label).toHaveValue('client')
    fireEvent.change(name, { target: { value: 'Client fires' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Priority' }), {
      target: { value: '1' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save filter' }))

    expect(
      await screen.findByRole('listitem', { name: 'Client fires' })
    ).toHaveTextContent('Priority: P1 · Label: client')
    expect(screen.queryByRole('heading', { name: 'Edit filter' })).toBeNull()
    expect(boardsApi.updateFilter).toHaveBeenCalledWith(id, {
      name: 'Client fires',
      criteria: { priority: 1, label: 'client' }
    })
  })

  it('edits a filter from its page and lists what now matches', async () => {
    const boardsApi = boards()
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: { priority: 1 }
    })
    renderRoute(`/filters/${id}`, { boardsApi })

    expect(await screen.findByText('Poster')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Edit filter' }))
    const label = screen.getByRole('combobox', { name: 'Label' })
    await within(label).findByRole('option', { name: 'client' })
    fireEvent.change(label, { target: { value: 'client' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save filter' }))

    await waitFor(() => {
      expect(screen.queryByText('Poster')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Logo')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Edit filter' })).toBeNull()
  })

  it('deletes a filter once its undo notice closes', async () => {
    const boardsApi = boards()
    await boardsApi.createFilter({ name: 'Urgent', criteria: { priority: 1 } })
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
    await boardsApi.createFilter({ name: 'Urgent', criteria: { priority: 1 } })
    await boardsApi.createFilter({ name: 'Mine', criteria: { assignee: 'me' } })
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
    await boardsApi.createFilter({ name: 'Urgent', criteria: { priority: 1 } })
    const { unmount } = renderRoute('/filters', { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete Urgent' })
    )
    unmount()

    await waitFor(() => {
      expect(boardsApi.deleteFilter).toHaveBeenCalledTimes(1)
    })
  })
})
