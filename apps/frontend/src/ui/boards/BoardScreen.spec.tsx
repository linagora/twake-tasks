import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/application/boards'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const alice = { userId: 'alice', email: 'alice.martin@example.com' }
const bob = { userId: 'bob', email: 'bob.durand@example.com' }

function designBoard() {
  const board = aBoard({
    name: 'Design',
    keyPrefix: 'DES',
    members: [alice, bob]
  })
  const [todo, doing] = board.sections
  board.tasks = [
    aTask(todo ?? null, {
      key: 'DES-1',
      title: 'Logo',
      priority: 1,
      dueDate: '2026-10-12',
      assignees: [alice]
    }),
    aTask(doing ?? null, { key: 'DES-2', title: 'Palette' })
  ]
  return board
}

const column = (name: string) => screen.getByRole('region', { name })

describe('BoardScreen', () => {
  it('shows each section with its tasks', async () => {
    const board = designBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Design' })
    ).toBeInTheDocument()
    const todo = within(column('To do'))
    const logo = todo.getByRole('article', { name: 'DES-1 Logo' })
    expect(within(logo).getByText('P1')).toBeInTheDocument()
    expect(
      within(logo).getByLabelText(/due Oct 12, 2026$/i)
    ).toBeInTheDocument()
    expect(
      within(logo).getByRole('img', {
        name: 'Assigned to alice.martin@example.com'
      })
    ).toBeInTheDocument()
    expect(
      within(column('In progress')).getByRole('article', {
        name: 'DES-2 Palette'
      })
    ).toBeInTheDocument()
    expect(within(column('Done')).queryAllByRole('article')).toHaveLength(0)
  })

  it('shows a No section column only when a task has no section', async () => {
    const board = designBoard()
    board.tasks.push(aTask(null, { key: 'DES-3', title: 'Loose' }))
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    expect(
      within(
        await screen.findByRole('region', { name: 'No section' })
      ).getByRole('article', { name: 'DES-3 Loose' })
    ).toBeInTheDocument()
  })

  it('adds tasks to a board without sections, like the Inbox', async () => {
    const board = aBoard({ name: 'Inbox', keyPrefix: 'INBOX', sections: [] })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const loose = within(
      await screen.findByRole('region', { name: 'No section' })
    )
    fireEvent.click(
      loose.getByRole('button', { name: 'Add a task to No section' })
    )
    fireEvent.change(loose.getByRole('textbox', { name: 'Task title' }), {
      target: { value: 'Call the bank' }
    })
    fireEvent.click(loose.getByRole('button', { name: 'Add' }))

    expect(
      await within(column('No section')).findByRole('article', {
        name: 'INBOX-1 Call the bank'
      })
    ).toBeInTheDocument()
  })

  it('adds a task to a section', async () => {
    const board = designBoard()
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    await screen.findByRole('heading', { level: 1, name: 'Design' })
    const done = within(column('Done'))
    fireEvent.click(done.getByRole('button', { name: 'Add a task to Done' }))
    fireEvent.change(done.getByRole('textbox', { name: 'Task title' }), {
      target: { value: 'Ship it' }
    })
    fireEvent.click(done.getByRole('button', { name: 'Add' }))

    expect(
      await within(column('Done')).findByRole('article', {
        name: 'DES-3 Ship it'
      })
    ).toBeInTheDocument()
  })

  it('moves a task to another section without dragging', async () => {
    const board = designBoard()
    const [logoTask] = board.tasks
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const logo = await screen.findByRole('article', { name: 'DES-1 Logo' })
    fireEvent.click(
      within(logo).getByRole('button', { name: 'Options for DES-1' })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to Done' }))

    expect(
      await within(column('Done')).findByRole('article', {
        name: 'DES-1 Logo'
      })
    ).toBeInTheDocument()
    const sectionId = board.sections[2]?.id
    expect(boardsApi.moveTask).toHaveBeenCalledWith(board.id, logoTask?.id, {
      sectionId
    })
  })

  it('offers no edits to a viewer', async () => {
    const board = { ...designBoard(), role: 'viewer' as const }
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const logo = await screen.findByRole('article', { name: 'DES-1 Logo' })
    expect(
      within(logo).queryByRole('button', { name: 'Options for DES-1' })
    ).not.toBeInTheDocument()
    expect(
      within(column('Done')).queryByRole('button', {
        name: 'Add a task to Done'
      })
    ).not.toBeInTheDocument()
  })

  it('says when a move fails', async () => {
    const board = designBoard()
    const boardsApi = fakeBoardsApi([board])
    boardsApi.moveTask.mockRejectedValue(new ApiError(409, 'archived'))
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const logo = await screen.findByRole('article', { name: 'DES-1 Logo' })
    fireEvent.click(
      within(logo).getByRole('button', { name: 'Options for DES-1' })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to Done' }))

    expect(
      await screen.findByText('The task could not be moved.')
    ).toBeInTheDocument()
  })

  it('assigns board members to a task', async () => {
    const board = designBoard()
    const palette = board.tasks[1]
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Options for DES-2' })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Assign' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Assign DES-2' }))
    fireEvent.click(dialog.getByRole('checkbox', { name: bob.email }))
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))

    expect(
      await within(
        await screen.findByRole('article', { name: 'DES-2 Palette' })
      ).findByRole('img', { name: `Assigned to ${bob.email}` })
    ).toBeInTheDocument()
    expect(boardsApi.setAssignees).toHaveBeenCalledWith(board.id, palette?.id, [
      bob.userId
    ])
  })

  it('keeps the dialog open when unassigning fails', async () => {
    const board = designBoard()
    const boardsApi = fakeBoardsApi([board])
    boardsApi.setAssignees.mockRejectedValue(
      new ApiError(400, 'invalid_assignee')
    )
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Options for DES-1' })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Assign' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Assign DES-1' }))
    const aliceBox = dialog.getByRole('checkbox', { name: alice.email })
    expect(aliceBox).toBeChecked()
    fireEvent.click(aliceBox)
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))

    expect(
      await dialog.findByText('The assignees could not be saved.')
    ).toBeInTheDocument()
    expect(boardsApi.setAssignees).toHaveBeenCalledWith(
      board.id,
      board.tasks[0]?.id,
      []
    )
  })

  it('adds a task to the first column from the header', async () => {
    const board = designBoard()
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'Add task' }))
    const todo = within(screen.getByRole('region', { name: 'To do' }))
    const title = todo.getByRole('textbox', { name: 'Task title' })
    expect(title).toHaveFocus()
    fireEvent.change(title, { target: { value: 'Banner' } })
    fireEvent.submit(title)

    expect(await todo.findByRole('button', { name: 'Banner' })).toBeVisible()
  })

  it('adds a section at the end', async () => {
    const board = designBoard()
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'New section' }))
    const dialog = within(screen.getByRole('dialog', { name: 'New section' }))
    fireEvent.change(dialog.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Review' }
    })
    fireEvent.change(dialog.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'started' }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('region', { name: 'Review' })).toBeVisible()
    expect(boardsApi.createSection).toHaveBeenCalledWith(board.id, {
      name: 'Review',
      category: 'started'
    })
  })

  it('renames a section', async () => {
    const board = designBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Options for To do' })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Edit section' }))
    fireEvent.change(dialog.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Later' }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))

    expect(
      within(await screen.findByRole('region', { name: 'Later' })).getByRole(
        'article',
        { name: 'DES-1 Logo' }
      )
    ).toBeInTheDocument()
  })

  it('moves a section to the right', async () => {
    const board = designBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Options for To do' })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move right' }))

    await waitFor(() => {
      expect(
        screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
      ).toEqual(['In progress', 'To do', 'Done'])
    })
  })

  it('asks where the tasks go when deleting a section that has some', async () => {
    const board = designBoard()
    const [todo, , done] = board.sections
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Options for To do' })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Delete To do?' }))
    fireEvent.change(
      dialog.getByRole('combobox', { name: 'Move its tasks to' }),
      { target: { value: done?.id } }
    )
    fireEvent.click(dialog.getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    expect(
      await within(column('Done')).findByRole('article', {
        name: 'DES-1 Logo'
      })
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'To do' })).toBeNull()
    expect(boardsApi.deleteSection).toHaveBeenCalledWith(
      board.id,
      todo?.id,
      done?.id
    )
  })

  it('lets only admins manage sections', async () => {
    const board = { ...designBoard(), role: 'editor' as const }
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    await screen.findByRole('heading', { level: 1, name: 'Design' })
    expect(screen.queryByRole('button', { name: 'New section' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Options for To do' })
    ).toBeNull()
  })

  it('says when the board does not exist', async () => {
    const boardsApi = fakeBoardsApi()
    boardsApi.getBoard.mockRejectedValue(new ApiError(404, 'not_found'))
    renderRoute('/boards/00000000-0000-7000-8000-000000000000', { boardsApi })

    expect(
      await screen.findByText("This board doesn't exist, or you can't open it.")
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Back to boards' })
    ).toHaveAttribute('href', '/')
  })
})
