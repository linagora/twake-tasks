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

// Picks a choice of a setting of the view, as its layout, from its menu.
async function choose(setting: string, from: string, to: string) {
  fireEvent.click(screen.getByRole('button', { name: `${setting}: ${from}` }))
  fireEvent.click(
    within(await screen.findByRole('menu', { name: setting })).getByRole(
      'menuitemradio',
      { name: to }
    )
  )
  expect(
    await screen.findByRole('button', { name: `${setting}: ${to}` })
  ).toBeVisible()
}

// Picks values of a criterion in its picker, as on a task, after adding the
// criterion from the menu unless it shows.
async function pick(criterion: string, ...values: string[]) {
  await screen.findByLabelText(/^Name/)
  const shown = screen.queryByRole('button', {
    name: new RegExp(`^(Add to|Change) ${criterion}$`)
  })
  if (shown) {
    fireEvent.click(shown)
  } else {
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: criterion }))
  }
  const picker = within(await screen.findByRole('dialog', { name: criterion }))
  for (const value of values) {
    fireEvent.click(
      await picker.findByRole('menuitemcheckbox', { name: value })
    )
  }
  fireEvent.keyDown(picker.getByRole('menu'), { key: 'Escape' })
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: criterion })).toBeNull()
  })
}

describe('FiltersScreen', () => {
  it('shows the criteria in use, and adds the others from a menu', async () => {
    renderRoute('/filters', { boardsApi: boards() })

    fireEvent.click(await screen.findByRole('link', { name: 'New view' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add filter' }))
    expect(
      (await screen.findAllByRole('menuitem')).map(item => item.textContent)
    ).toEqual(['Board', 'Section', 'Assignee', 'Label', 'Priority', 'Due'])
    expect(screen.queryByText('No criteria')).toBeNull()

    // A criterion added opens its picker, and stays though nothing is picked.
    fireEvent.click(screen.getByRole('menuitem', { name: 'Priority' }))
    const picker = await screen.findByRole('dialog', { name: 'Priority' })
    fireEvent.keyDown(within(picker).getByRole('menu'), { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Priority' })).toBeNull()
    })
    expect(
      screen.getByRole('button', { name: 'Add to Priority' })
    ).toBeVisible()
    expect(screen.getByText('No criteria')).toBeVisible()

    await pick('Priority', 'P1')
    fireEvent.click(screen.getByRole('button', { name: 'Remove P1' }))
    expect(screen.getByText('No criteria')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }))
    expect(
      (await screen.findAllByRole('menuitem')).map(item => item.textContent)
    ).not.toContain('Priority')
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })

    // The plus is by the title once a filter shows; the bin takes it off.
    expect(
      screen.getByRole('heading', { name: 'Filters' }).parentElement
    ).toContainElement(screen.getByRole('button', { name: 'Add filter' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove the Priority filter' })
    )
    expect(screen.queryByRole('button', { name: 'Add to Priority' })).toBeNull()
  })

  it('groups a view by the criterion chosen, its sections unless said', async () => {
    const boardsApi = boards()
    renderRoute('/filters/new', { boardsApi })

    fireEvent.change(await screen.findByLabelText(/^Name/), {
      target: { value: 'By label' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Group by: Section' }))
    const choices = within(
      await screen.findByRole('menu', { name: 'Group by' })
    )
    expect(
      choices.getByRole('menuitemradio', { name: 'Section' })
    ).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(choices.getByRole('menuitemradio', { name: 'Label' }))
    expect(
      await screen.findByRole('button', { name: 'Group by: Label' })
    ).toBeVisible()
    // Only columns of statuses can have no task.
    expect(
      screen.queryByRole('switch', { name: 'Show all columns' })
    ).toBeNull()
    await choose('Layout', 'List', 'Board')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(boardsApi.createFilter).toHaveBeenCalledWith(
        expect.objectContaining({ groupBy: 'label' })
      )
    })
    expect(
      await screen.findByRole('region', { name: 'client' })
    ).toHaveTextContent('Logo')
    expect(screen.getByRole('region', { name: 'No label' })).toHaveTextContent(
      'Poster'
    )
  })

  it('keeps to any of many values, shown as on a task', async () => {
    const boardsApi = boards()
    renderRoute('/filters/new', { boardsApi })

    fireEvent.change(await screen.findByLabelText(/^Name/), {
      target: { value: 'Mine or nobody’s' }
    })
    await pick('Assignee', 'Me', 'Unassigned')
    await pick('Due', 'Overdue', 'Today')
    await pick('Priority', 'P1', 'P2')
    await pick('Label', 'client')
    expect(screen.getByText('client')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Remove client' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(boardsApi.createFilter).toHaveBeenCalledWith(
        expect.objectContaining({
          criteria: {
            assignees: ['me', 'nobody'],
            priorities: [1, 2],
            labels: ['client'],
            dues: ['today']
          }
        })
      )
    })
  })

  it('takes a chosen value off with its cross', async () => {
    const boardsApi = boards()
    renderRoute('/filters/new', { boardsApi })

    fireEvent.change(await screen.findByLabelText(/^Name/), {
      target: { value: 'High' }
    })
    await pick('Priority', 'P1', 'P2')
    // The plus follows the values chosen.
    expect(
      screen.getByRole('button', { name: 'Remove P2' }).parentElement
        ?.parentElement
    ).toContainElement(screen.getByRole('button', { name: 'Add to Priority' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove P1' }))
    expect(screen.queryByRole('button', { name: 'Remove P1' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(boardsApi.createFilter).toHaveBeenCalledWith(
        expect.objectContaining({ criteria: { priorities: [2] } })
      )
    })
  })

  it('keeps to columns by name, offering those of all my boards', async () => {
    const boardsApi = boards()
    renderRoute('/filters/new', { boardsApi })

    fireEvent.change(await screen.findByLabelText(/^Name/), {
      target: { value: 'In progress' }
    })
    await pick('Section', 'In progress')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(boardsApi.createFilter).toHaveBeenCalledWith(
        expect.objectContaining({ criteria: { statuses: ['In progress'] } })
      )
    })
  })

  it('keeps to anyone who shares a board with me', async () => {
    const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
    design.members = [
      { userId: 'lea', email: 'lea@example.com', name: 'Léa Martin' }
    ]
    const boardsApi = fakeBoardsApi([design])
    renderRoute('/filters/new', { boardsApi })

    fireEvent.change(await screen.findByLabelText(/^Name/), {
      target: { value: 'Léa’s' }
    })
    await pick('Assignee', 'Léa Martin')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(boardsApi.createFilter).toHaveBeenCalledWith(
        expect.objectContaining({ criteria: { assignees: ['lea'] } })
      )
    })
    expect(await screen.findByLabelText('Assignee: Léa Martin')).toBeVisible()
  })

  it('creates a view on its own page, then opens it', async () => {
    const boardsApi = boards()
    renderRoute('/filters', { boardsApi })

    expect(screen.queryByLabelText(/^Name/)).toBeNull()
    fireEvent.click(await screen.findByRole('link', { name: 'New view' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'New view' })
    ).toBeVisible()
    fireEvent.change(await screen.findByLabelText(/^Name/), {
      target: { value: 'Client fires' }
    })
    await pick('Priority', 'P1')
    await pick('Label', 'client')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(
      await screen.findByRole('heading', { name: 'Client fires' })
    ).toBeVisible()
    expect(await screen.findByText('Logo')).toBeVisible()
    expect(screen.queryByText('Poster')).not.toBeInTheDocument()
    expect(boardsApi.createFilter).toHaveBeenCalledWith({
      name: 'Client fires',
      criteria: { priorities: [1], labels: ['client'] },
      icon: 'Eye',
      layout: 'list',
      groupBy: 'status',
      allColumns: false
    })
    expect(boardsApi.filteredTasks).toHaveBeenCalledWith(
      expect.any(String),
      localZone()
    )
  })

  it('gives a view an icon, the eye unless chosen', async () => {
    const boardsApi = boards()
    renderRoute('/filters/new', { boardsApi })

    fireEvent.change(await screen.findByLabelText(/^Name/), {
      target: { value: 'Bugs' }
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Change the view’s icon' })
    )
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Choose an icon' })
    )
    expect(dialog.getByRole('button', { name: 'Eye' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    fireEvent.change(dialog.getByLabelText('Search for an icon'), {
      target: { value: 'troph' }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Trophy' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByRole('heading', { name: 'Bugs' })).toBeVisible()
    expect(boardsApi.createFilter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Bugs', icon: 'Trophy' })
    )
  })

  it('creates a view in the layout chosen', async () => {
    const boardsApi = boards()
    renderRoute('/filters/new', { boardsApi })

    fireEvent.change(await screen.findByLabelText(/^Name/), {
      target: { value: 'Agenda' }
    })
    expect(screen.getByRole('list', { name: 'Filters' })).toContainElement(
      screen.getByRole('button', { name: 'Add filter' })
    )
    expect(screen.queryByText('Icon, name, layout and criteria')).toBeNull()
    await choose('Layout', 'List', 'Calendar')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(
      await screen.findByRole('button', { name: 'Previous month' })
    ).toBeVisible()
    expect(boardsApi.createFilter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Agenda', layout: 'calendar' })
    )
  })

  it('saves each edit of a view as it is made, with no button', async () => {
    const boardsApi = boards()
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: { priorities: [1] }
    })
    renderRoute(`/filters/${id}/edit`, { boardsApi })

    const name = await screen.findByLabelText(/^Name/)
    expect(name).toHaveValue('Urgent')
    expect(screen.getByText('P1')).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull()
    fireEvent.change(name, { target: { value: 'Client fires' } })
    await choose('Layout', 'List', 'Board')

    await waitFor(() => {
      expect(boardsApi.updateFilter).toHaveBeenCalledWith(id, {
        name: 'Client fires',
        criteria: { priorities: [1] },
        icon: 'Eye',
        layout: 'board',
        groupBy: 'status',
        allColumns: false
      })
    })
    expect(boardsApi.updateFilter).toHaveBeenCalledTimes(1)
    const saved = await screen.findByRole('status')
    expect(saved).toHaveTextContent('Changes saved')
    // Said in the header, where Create is on a new view.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Edit view' }).parentElement
        ?.parentElement
    ).toContainElement(saved)

    // A name being typed waits until there is one.
    fireEvent.change(name, { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('link', { name: 'Back to views' }))
    expect(
      await screen.findByRole('link', { name: 'Client fires' })
    ).toBeVisible()
    expect(boardsApi.updateFilter).toHaveBeenCalledTimes(1)
  })

  it('asks for a name when a view is created without one', async () => {
    const boardsApi = boards()
    renderRoute('/filters/new', { boardsApi })

    const name = await screen.findByLabelText(/^Name/)
    const create = screen.getByRole('button', { name: 'Create' })
    expect(create).toBeEnabled()
    // Created from the page's header, with no Cancel.
    expect(
      screen.getByRole('heading', { level: 1, name: 'New view' }).parentElement
        ?.parentElement
    ).toContainElement(create)
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    fireEvent.click(create)

    expect(await screen.findByText('A name is required.')).toBeVisible()
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveFocus()
    expect(boardsApi.createFilter).not.toHaveBeenCalled()

    fireEvent.change(name, { target: { value: 'Mine' } })
    expect(screen.queryByText('A name is required.')).toBeNull()
    fireEvent.click(create)
    await waitFor(() => {
      expect(boardsApi.createFilter).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Mine' })
      )
    })
  })

  it('saves in a view whether it shows the columns of no task', async () => {
    const boardsApi = boards()
    const { id } = await boardsApi.createFilter({ name: 'All', criteria: {} })
    renderRoute(`/filters/${id}/edit`, { boardsApi })

    const all = await screen.findByRole('switch', {
      name: 'Show all columns'
    })
    expect(all).not.toBeChecked()
    fireEvent.click(all)

    await waitFor(() => {
      expect(boardsApi.updateFilter).toHaveBeenCalledWith(
        id,
        expect.objectContaining({ allColumns: true })
      )
    })
  })

  it('saves an edit still waiting on leaving the page', async () => {
    const boardsApi = boards()
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: {}
    })
    renderRoute(`/filters/${id}/edit`, { boardsApi })

    fireEvent.change(await screen.findByLabelText(/^Name/), {
      target: { value: 'Now' }
    })
    fireEvent.click(screen.getByRole('link', { name: 'Back to views' }))

    await waitFor(() => {
      expect(boardsApi.updateFilter).toHaveBeenCalledWith(
        id,
        expect.objectContaining({ name: 'Now' })
      )
    })
    expect(await screen.findByRole('link', { name: 'Now' })).toBeVisible()
  })

  it('sums up what each saved filter looks for', async () => {
    const boardsApi = boards()
    await boardsApi.createFilter({
      name: 'Client fires',
      criteria: { priorities: [1], labels: ['client'] }
    })
    await boardsApi.createFilter({ name: 'Everything', criteria: {} })
    renderRoute('/filters', { boardsApi })

    expect(
      await screen.findByRole('link', { name: 'Client fires' })
    ).toHaveTextContent('Label: client and Priority: P1')
    expect(screen.getByRole('link', { name: 'Everything' })).toHaveTextContent(
      'All tasks'
    )
  })

  it('stars a view, which goes first and into the favorites', async () => {
    const boardsApi = boards()
    await boardsApi.createFilter({ name: 'Alpha', criteria: {} })
    await boardsApi.createFilter({ name: 'Beta', criteria: {} })
    renderRoute('/filters', { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Add Beta to favorites' })
    )

    const favourites = within(
      await screen.findByRole('list', { name: 'Favorites' })
    )
    expect(await favourites.findByRole('link', { name: 'Beta' })).toBeVisible()
    expect(favourites.queryByRole('link', { name: 'Alpha' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Remove Beta from favorites' })
    ).toBeVisible()
    await waitFor(() => {
      expect(
        within(screen.getByRole('list', { name: 'Saved views' }))
          .getAllByRole('link', { name: /^(Alpha|Beta)$/ })
          .map(link => link.getAttribute('aria-label'))
      ).toEqual(['Beta', 'Alpha'])
    })
  })

  it('ends each view of the list with its star and menu', async () => {
    const boardsApi = boards()
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: {}
    })
    renderRoute('/filters', { boardsApi })

    expect(
      await screen.findByRole('button', { name: 'Add Urgent to favorites' })
    ).toBeVisible()
    expect(screen.queryByText('Saved views')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Actions of Urgent' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit view' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Edit view' })
    ).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'Back to views' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Actions of Urgent' })
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete view' })
    )
    fireEvent.click(
      within(
        await screen.findByRole('dialog', { name: 'Delete “Urgent”?' })
      ).getByRole('button', { name: 'Delete' })
    )
    await waitFor(() => {
      expect(boardsApi.deleteFilter).toHaveBeenCalledWith(id)
    })
  })

  it('deletes a view from its menu, once a dialog has asked', async () => {
    const boardsApi = boards()
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: { priorities: [1] }
    })
    renderRoute(`/filters/${id}`, { boardsApi })
    const askToDelete = async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Actions of Urgent' })
      )
      fireEvent.click(
        await screen.findByRole('menuitem', { name: 'Delete view' })
      )
      return within(
        await screen.findByRole('dialog', { name: 'Delete “Urgent”?' })
      )
    }

    fireEvent.click(
      (await askToDelete()).getByRole('button', { name: 'Cancel' })
    )
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(boardsApi.deleteFilter).not.toHaveBeenCalled()

    fireEvent.click(
      (await askToDelete()).getByRole('button', { name: 'Delete' })
    )

    expect(await findEmptyState('No saved views')).toHaveTextContent(
      'Save the criteria you look for often, like your P1 tasks.'
    )
    expect(
      screen
        .getByRole('list', { name: 'Main menu' })
        .querySelector('a[href="/filters"]')
    ).not.toBeNull()
  })
})
