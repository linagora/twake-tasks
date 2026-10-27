import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { localToday } from '@/ui/boards/dueLabel'
import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'
import { typeRichText } from '@/testing/richText'

async function openNewTask() {
  const inbox = aBoard({
    name: 'Inbox',
    keyPrefix: 'INB',
    inbox: true,
    sections: []
  })
  const design = aBoard({
    name: 'Product Design',
    keyPrefix: 'DES',
    members: [{ userId: 'u-ana', email: 'ana@example.com', name: 'Ana Lopez' }],
    labels: [{ id: 'l1', name: 'ops', color: null }]
  })
  const boardsApi = fakeBoardsApi([inbox, design])
  renderRoute(`/boards/${design.id}`, { boardsApi })
  fireEvent.click(await screen.findByRole('button', { name: 'Create task' }))
  const dialog = within(
    await screen.findByRole('dialog', { name: 'Create a task' })
  )
  const title = () => dialog.getByRole('textbox', { name: 'Title' })
  const create = () => dialog.getByRole('button', { name: 'Create' })
  return { dialog, title, create, inbox, design, boardsApi }
}

describe('NewTaskDialog', () => {
  it('creates the task in the board it is opened from, then closes', async () => {
    const { dialog, title, create, design } = await openNewTask()
    expect(title()).toHaveFocus()
    expect(dialog.queryByRole('textbox', { name: 'Description' })).toBe(null)
    expect(dialog.queryByRole('combobox', { name: 'Board' })).toBe(null)

    fireEvent.change(title(), { target: { value: 'Logo' } })
    fireEvent.click(create())

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBe(null)
    })
    expect(design.tasks).toMatchObject([{ key: 'DES-1', title: 'Logo' }])
    expect(
      await screen.findByRole('button', { name: 'Logo' })
    ).toBeInTheDocument()
  })

  it('says the task was created, with a link to it in its board', async () => {
    const { dialog, title, create } = await openNewTask()
    fireEvent.click(dialog.getByRole('button', { name: 'Add details' }))
    fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Board' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Inbox' }))
    fireEvent.change(title(), { target: { value: 'Milk' } })
    fireEvent.click(create())

    const status = await screen.findByRole('status', {
      name: '“Milk” has been created'
    })
    fireEvent.click(
      within(status).getByRole('button', { name: 'See the task' })
    )

    expect(
      await screen.findByRole('dialog', { name: 'INB-1 Milk' })
    ).toBeVisible()
    expect(
      screen.queryByRole('status', { name: '“Milk” has been created' })
    ).toBe(null)
  })

  it('takes the alert away after a few seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { title, create } = await openNewTask()
      fireEvent.change(title(), { target: { value: 'Logo' } })
      fireEvent.click(create())
      await screen.findByRole('status', { name: '“Logo” has been created' })

      await act(() => vi.advanceTimersByTimeAsync(5000))

      await waitFor(() => {
        expect(
          screen.queryByRole('status', { name: '“Logo” has been created' })
        ).toBe(null)
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('highlights the new task in its board until a task is opened', async () => {
    const { title, create } = await openNewTask()
    fireEvent.change(title(), { target: { value: 'Logo' } })
    fireEvent.click(create())

    const card = await screen.findByRole('article', { name: 'DES-1 Logo' })
    expect(card).toHaveAttribute('data-new-task')
    fireEvent.click(within(card).getByRole('button', { name: 'Logo' }))

    expect(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    ).toBeVisible()
    expect(
      // Behind the open panel, the board is hidden from assistive technology.
      screen.getByRole('article', { name: 'DES-1 Logo', hidden: true })
    ).not.toHaveAttribute('data-new-task')
  })

  it('asks for a title rather than creating an untitled task', async () => {
    const { dialog, title, create, boardsApi } = await openNewTask()
    fireEvent.change(title(), { target: { value: '   ' } })

    fireEvent.click(create())

    expect(await dialog.findByText("The title can't be empty.")).toBeVisible()
    expect(title()).toHaveAttribute('aria-invalid', 'true')
    expect(title()).toHaveFocus()
    expect(boardsApi.createTask).not.toHaveBeenCalled()
    fireEvent.change(title(), { target: { value: 'Logo' } })
    expect(dialog.queryByText("The title can't be empty.")).toBe(null)
  })

  it('leaves the focus in the description while it is typed', async () => {
    const { dialog, title } = await openNewTask()
    fireEvent.click(dialog.getByRole('button', { name: 'Add details' }))
    const description = dialog.getByRole('textbox', { name: 'Description' })
    description.focus()

    await typeRichText(description, 'Three variants')

    expect(title()).not.toHaveFocus()
    expect(title()).toHaveValue('')
  })

  it('sets the description, assignees, labels, due date and priority', async () => {
    const { dialog, title, create, design, boardsApi } = await openNewTask()

    fireEvent.change(title(), { target: { value: 'Logo' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Add details' }))
    expect(
      dialog.getByRole('button', { name: 'Hide details' })
    ).toHaveAttribute('aria-expanded', 'true')
    await typeRichText(
      dialog.getByRole('textbox', { name: 'Description' }),
      'Three variants'
    )
    fireEvent.click(
      await dialog.findByRole('button', { name: 'Add assignees' })
    )
    const assign = await screen.findByRole('dialog', {
      name: 'Assign the new task'
    })
    fireEvent.click(
      within(assign).getByRole('menuitemcheckbox', { name: /Ana Lopez/ })
    )
    fireEvent.keyDown(assign, { key: 'Escape' })
    expect(await dialog.findByText('Ana Lopez')).toBeVisible()
    fireEvent.click(dialog.getByRole('button', { name: 'Add labels' }))
    const label = await screen.findByRole('dialog', {
      name: 'Label the new task'
    })
    fireEvent.click(
      within(label).getByRole('menuitemcheckbox', { name: 'ops' })
    )
    fireEvent.keyDown(label, { key: 'Escape' })
    fireEvent.click(
      await dialog.findByRole('button', { name: 'Due date: No date' })
    )
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'Due date' })).getByRole(
        'button',
        { name: 'Today' }
      )
    )
    fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Priority' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Priority 1' }))
    fireEvent.click(create())

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBe(null)
    })
    expect(design.tasks).toMatchObject([
      {
        title: 'Logo',
        priority: 1,
        dueDate: localToday(),
        assignees: [{ userId: 'u-ana' }],
        labels: [{ id: 'l1' }]
      }
    ])
    expect(boardsApi.setDescription).toHaveBeenCalledWith(
      design.id,
      design.tasks[0]?.id,
      { markdown: 'Three variants', version: 0 }
    )
  })

  it('shows the priority as on a card, with its flag and colour', async () => {
    const { dialog } = await openNewTask()
    fireEvent.click(dialog.getByRole('button', { name: 'Add details' }))

    fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Priority' }))
    const option = await screen.findByRole('option', { name: 'Priority 2' })
    expect(option).toHaveTextContent('P2')
    fireEvent.click(option)

    expect(
      within(dialog.getByRole('combobox', { name: 'Priority' })).getByRole(
        'img',
        { name: 'Priority 2' }
      )
    ).toHaveTextContent('P2')
  })

  it('creates the task in the board picked, without the assignees picked before', async () => {
    const { dialog, title, create, inbox, design } = await openNewTask()
    fireEvent.click(dialog.getByRole('button', { name: 'Add details' }))
    fireEvent.click(
      await dialog.findByRole('button', { name: 'Add assignees' })
    )
    const assign = await screen.findByRole('dialog', {
      name: 'Assign the new task'
    })
    fireEvent.click(
      within(assign).getByRole('menuitemcheckbox', { name: /Ana Lopez/ })
    )
    fireEvent.keyDown(assign, { key: 'Escape' })

    expect(dialog.getByRole('combobox', { name: 'Board' })).toHaveTextContent(
      'Product Design'
    )
    fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Board' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Inbox' }))
    expect(
      await dialog.findByRole('combobox', { name: 'Board' })
    ).toHaveTextContent('Inbox')
    expect(dialog.queryByText('Ana Lopez')).toBe(null)
    fireEvent.change(title(), { target: { value: 'Milk' } })
    fireEvent.click(create())

    await waitFor(() => {
      expect(inbox.tasks).toMatchObject([{ title: 'Milk', assignees: [] }])
    })
    expect(design.tasks).toEqual([])
  })

  it('creates the task in the section picked, offered by the board picked', async () => {
    const { dialog, title, create, design } = await openNewTask()
    fireEvent.click(dialog.getByRole('button', { name: 'Add details' }))
    const section = () => dialog.queryByRole('combobox', { name: 'Section' })
    expect(section()).toHaveTextContent('To do')

    fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Board' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Inbox' }))
    // The Inbox is loaded once its assignees can be edited.
    await dialog.findByRole('button', { name: 'Add assignees' })
    expect(section()).toBe(null)
    // The row stays, so that nothing moves.
    expect(dialog.getByText('No section')).toBeVisible()
    fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Board' }))
    fireEvent.click(
      await screen.findByRole('option', { name: 'Product Design' })
    )
    fireEvent.mouseDown(
      await dialog.findByRole('combobox', { name: 'Section' })
    )
    fireEvent.click(await screen.findByRole('option', { name: 'In progress' }))
    fireEvent.change(title(), { target: { value: 'Logo' } })
    fireEvent.click(create())

    await waitFor(() => {
      expect(design.tasks).toMatchObject([
        {
          title: 'Logo',
          sectionId: design.sections.find(each => each.name === 'In progress')
            ?.id
        }
      ])
    })
  })

  it('names the only section of a board, with nothing to pick', async () => {
    const board = aBoard({ name: 'Notes', keyPrefix: 'NOT' })
    board.sections = board.sections.slice(0, 1)
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })
    fireEvent.click(await screen.findByRole('button', { name: 'Create task' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Create a task' })
    )

    fireEvent.click(dialog.getByRole('button', { name: 'Add details' }))

    expect(await dialog.findByText(board.sections[0]?.name ?? '')).toBeVisible()
    expect(dialog.queryByRole('combobox', { name: 'Section' })).toBe(null)
  })

  it('offers only the boards a task can be added to', async () => {
    const inbox = aBoard({ name: 'Inbox', keyPrefix: 'INB', inbox: true })
    const boards = [
      inbox,
      aBoard({ name: 'Old', archived: true }),
      aBoard({ name: 'Shared', role: 'viewer' })
    ]
    renderRoute('/', { boardsApi: fakeBoardsApi(boards) })
    fireEvent.click(await screen.findByRole('button', { name: 'Create task' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Create a task' })
    )

    fireEvent.click(await dialog.findByRole('button', { name: 'Add details' }))
    fireEvent.mouseDown(await dialog.findByRole('combobox', { name: 'Board' }))
    const options = within(await screen.findByRole('listbox'))
    expect(
      options.getAllByRole('option').map(option => option.textContent)
    ).toEqual(['Inbox'])
  })

  it('says when the task could not be created, and keeps what was typed', async () => {
    const { dialog, title, create, boardsApi } = await openNewTask()
    boardsApi.createTask.mockRejectedValueOnce(new Error('offline'))

    fireEvent.change(title(), { target: { value: 'Logo' } })
    fireEvent.click(create())

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'The task could not be created.'
    )
    expect(title()).toHaveValue('Logo')
  })

  it('finishes the task already created when saved again after its details failed', async () => {
    const { dialog, title, create, design, boardsApi } = await openNewTask()
    boardsApi.setLabels.mockRejectedValueOnce(new Error('offline'))
    fireEvent.change(title(), { target: { value: 'Logo' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Add details' }))
    await typeRichText(
      dialog.getByRole('textbox', { name: 'Description' }),
      'Three variants'
    )
    fireEvent.click(dialog.getByRole('button', { name: 'Add labels' }))
    const label = await screen.findByRole('dialog', {
      name: 'Label the new task'
    })
    fireEvent.click(
      within(label).getByRole('menuitemcheckbox', { name: 'ops' })
    )
    fireEvent.keyDown(label, { key: 'Escape' })
    fireEvent.click(create())

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'The task was created, but some of its details were not saved.'
    )
    expect(dialog.getByRole('combobox', { name: 'Board' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBe(null)
    })
    expect(boardsApi.createTask).toHaveBeenCalledTimes(1)
    expect(design.tasks).toMatchObject([
      { key: 'DES-1', title: 'Logo', labels: [{ id: 'l1' }] }
    ])
    expect(
      await boardsApi.getDescription(design.id, design.tasks[0]?.id ?? '')
    ).toMatchObject({ markdown: 'Three variants' })
  })

  it('creates the task once when submitted again while creating', async () => {
    const { title, create, boardsApi } = await openNewTask()
    const createTask = boardsApi.createTask.getMockImplementation()
    if (!createTask) throw new Error('The fake API creates tasks')
    const { promise: held, resolve: release } = Promise.withResolvers<null>()
    boardsApi.createTask.mockImplementationOnce(async (...args) => {
      await held
      return createTask(...args)
    })
    fireEvent.change(title(), { target: { value: 'Logo' } })

    fireEvent.click(create())
    await waitFor(() => {
      expect(create()).toBeDisabled()
    })
    // As a second Ctrl+Enter in the description does, past the button.
    fireEvent.submit(create())
    release(null)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBe(null)
    })
    expect(boardsApi.createTask).toHaveBeenCalledTimes(1)
  })

  it('closes from the cross in its corner', async () => {
    const { dialog } = await openNewTask()

    fireEvent.click(dialog.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).toBe(null)
  })

  it('holds ?new=task in the URL while open, so a link opens it', async () => {
    const board = aBoard({ name: 'Product Design' })
    const { router } = renderRoute(`/boards/${board.id}?new=task`, {
      boardsApi: fakeBoardsApi([board])
    })
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Create a task' })
    )

    fireEvent.click(dialog.getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBe(null)
    })
    expect(router.state.location.search).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect(router.state.location.search).toBe('?new=task')
    expect(router.state.location.pathname).toBe(`/boards/${board.id}`)
  })

  it('leaves out a due date from the URL that is no day', async () => {
    const board = aBoard({ name: 'Product Design' })
    renderRoute(`/boards/${board.id}?new=task&due=2026-02-31`, {
      boardsApi: fakeBoardsApi([board])
    })
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Create a task' })
    )

    fireEvent.click(dialog.getByRole('button', { name: 'Add details' }))

    expect(
      dialog.getByRole('button', { name: 'Due date: No date' })
    ).toBeVisible()
  })
})
