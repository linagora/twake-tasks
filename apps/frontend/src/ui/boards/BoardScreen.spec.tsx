import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/application/boards'
import { aBoard, aProject, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const alice = {
  userId: 'alice',
  email: 'alice.martin@example.com',
  name: 'Alice Martin'
}
const bob = { userId: 'bob', email: 'bob.durand@example.com', name: null }

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
        name: 'Assigned to Alice Martin'
      })
    ).toBeInTheDocument()
    expect(
      within(column('In progress')).getByRole('article', {
        name: 'DES-2 Palette'
      })
    ).toBeInTheDocument()
    expect(within(column('Done')).queryAllByRole('article')).toHaveLength(0)
    expect(within(column('Done')).getByRole('status')).toHaveTextContent(
      'No tasks'
    )
  })

  it('shows placeholder columns while the board loads', async () => {
    const boardsApi = fakeBoardsApi()
    boardsApi.getBoard.mockReturnValue(new Promise(() => undefined))
    renderRoute('/boards/any', { boardsApi })

    expect(
      await screen.findByRole('progressbar', { name: 'Loading' })
    ).toBeInTheDocument()
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

  it('lets editors pick a card up from the keyboard', async () => {
    const board = designBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const logo = await screen.findByRole('article', { name: 'DES-1 Logo' })
    expect(logo).toHaveAttribute('aria-roledescription', 'draggable task')
    expect(logo).toHaveAttribute('tabindex', '0')
    expect(
      document.getElementById(logo.getAttribute('aria-describedby') ?? '')
    ).toHaveTextContent('To move a task, press space or enter.')
  })

  it('keeps cards in place for a viewer', async () => {
    const board = { ...designBoard(), role: 'viewer' as const }
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const logo = await screen.findByRole('article', { name: 'DES-1 Logo' })
    expect(logo).not.toHaveAttribute('aria-roledescription')
    expect(logo).not.toHaveAttribute('tabindex')
  })

  it('shows a moved task in its new section before the server answers', async () => {
    const board = designBoard()
    const boardsApi = fakeBoardsApi([board])
    boardsApi.moveTask.mockReturnValue(new Promise(() => undefined))
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
    expect(
      within(column('To do')).getByRole('article', { name: 'DES-1 Logo' })
    ).toBeInTheDocument()
  })

  it('opens the assignee picker with the a key on a focused card', async () => {
    const board = designBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const card = await screen.findByRole('article', { name: 'DES-2 Palette' })
    card.focus()
    fireEvent.keyDown(card, { key: 'a' })

    expect(
      await screen.findByRole('dialog', { name: 'Assign DES-2' })
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
    const picker = within(
      await screen.findByRole('dialog', { name: 'Assign DES-2' })
    )
    fireEvent.change(picker.getByRole('textbox', { name: 'Search people' }), {
      target: { value: 'bob' }
    })
    expect(
      picker.queryByRole('menuitemcheckbox', { name: alice.email })
    ).not.toBeInTheDocument()
    fireEvent.click(picker.getByRole('menuitemcheckbox', { name: bob.email }))

    expect(
      await within(
        await screen.findByRole('article', {
          name: 'DES-2 Palette',
          hidden: true
        })
      ).findByRole('img', { name: `Assigned to ${bob.email}`, hidden: true })
    ).toBeInTheDocument()
    expect(boardsApi.setAssignees).toHaveBeenCalledWith(board.id, palette?.id, [
      bob.userId
    ])
  })

  it('says when unassigning fails and keeps the assignee', async () => {
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
    const picker = within(
      await screen.findByRole('dialog', { name: 'Assign DES-1' })
    )
    const aliceItem = picker.getByRole('menuitemcheckbox', {
      name: `Alice Martin ${alice.email}`
    })
    expect(aliceItem).toBeChecked()
    fireEvent.click(aliceItem)

    expect(
      await picker.findByText('The assignees could not be saved.')
    ).toBeInTheDocument()
    expect(aliceItem).toBeChecked()
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

  it('closes the add task form on Escape or Cancel', async () => {
    const board = designBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })
    const todo = within(await screen.findByRole('region', { name: 'To do' }))
    const opener = () =>
      todo.getByRole('button', { name: 'Add a task to To do' })

    fireEvent.click(opener())
    fireEvent.keyDown(todo.getByRole('textbox', { name: 'Task title' }), {
      key: 'Escape'
    })

    expect(
      todo.queryByRole('textbox', { name: 'Task title' })
    ).not.toBeInTheDocument()
    expect(opener()).toHaveFocus()

    fireEvent.click(opener())
    fireEvent.click(todo.getByRole('button', { name: 'Cancel' }))

    expect(
      todo.queryByRole('textbox', { name: 'Task title' })
    ).not.toBeInTheDocument()
  })

  it('keeps one add task form open at a time', async () => {
    const board = designBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })
    const todo = within(await screen.findByRole('region', { name: 'To do' }))
    const done = within(screen.getByRole('region', { name: 'Done' }))

    fireEvent.click(todo.getByRole('button', { name: 'Add a task to To do' }))
    fireEvent.click(done.getByRole('button', { name: 'Add a task to Done' }))

    expect(
      todo.queryByRole('textbox', { name: 'Task title' })
    ).not.toBeInTheDocument()
    expect(done.getByRole('textbox', { name: 'Task title' })).toHaveFocus()
  })

  it('closes the add task form on a click outside and keeps the draft', async () => {
    const board = designBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })
    const todo = within(await screen.findByRole('region', { name: 'To do' }))
    const opener = () =>
      todo.getByRole('button', { name: 'Add a task to To do' })

    fireEvent.click(opener())
    fireEvent.change(todo.getByRole('textbox', { name: 'Task title' }), {
      target: { value: 'Banner' }
    })
    await waitFor(() => {
      fireEvent.click(document.body)
      expect(
        todo.queryByRole('textbox', { name: 'Task title' })
      ).not.toBeInTheDocument()
    })

    fireEvent.click(opener())
    expect(todo.getByRole('textbox', { name: 'Task title' })).toHaveValue(
      'Banner'
    )
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
    fireEvent.change(dialog.getByRole('combobox', { name: 'Section type' }), {
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

  describe('member stack', () => {
    it('opens the share dialog for an admin of a shareable project', async () => {
      const board = designBoard()
      const boardsApi = fakeBoardsApi([board])
      boardsApi.sharings.set(board.id, { members: [], invites: [] })
      renderRoute(`/boards/${board.id}`, { boardsApi })

      fireEvent.click(await screen.findByRole('button', { name: '2 members' }))

      expect(
        await screen.findByRole('dialog', { name: 'Share Design' })
      ).toBeVisible()
    })

    it.each([
      ['a viewer', () => ({ role: 'viewer' as const })],
      ['a personal project', () => ({ project: aProject({ personal: true }) })]
    ])('lists the members read-only for %s', async (_name, overrides) => {
      const board = { ...designBoard(), ...overrides() }
      renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

      fireEvent.click(await screen.findByRole('button', { name: '2 members' }))

      const dialog = within(
        await screen.findByRole('dialog', { name: 'People with access' })
      )
      expect(dialog.getByText('Alice Martin')).toBeVisible()
      expect(dialog.getByText('bob.durand@example.com')).toBeVisible()
      expect(dialog.queryByRole('button', { name: /^Role/ })).toBeNull()
    })

    it('summarises a larger board with a +N bubble', async () => {
      const board = aBoard({
        members: Array.from({ length: 6 }, (_, index) => ({
          userId: `u${String(index)}`,
          email: `u${String(index)}@example.com`,
          name: null
        }))
      })
      renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

      const stack = await screen.findByRole('button', { name: '6 members' })
      expect(stack).toHaveTextContent('+2')
    })
  })

  describe('renaming', () => {
    const heading = (name: string) =>
      screen.findByRole('heading', { level: 1, name })

    it('renames from the menu, with a trimmed name, and the sidebar follows', async () => {
      const board = designBoard()
      const boardsApi = fakeBoardsApi([board])
      await boardsApi.setFavorite(board.id, true)
      renderRoute(`/boards/${board.id}`, { boardsApi })

      await heading('Design')
      expect(await screen.findByRole('link', { name: 'Design' })).toBeVisible()
      fireEvent.click(screen.getByRole('button', { name: 'Board options' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename board' }))
      const field = await screen.findByRole('textbox', { name: 'Board name' })
      expect(field).toHaveValue('Design')
      fireEvent.change(field, { target: { value: '  Product  ' } })
      fireEvent.keyDown(field, { key: 'Enter' })

      await heading('Product')
      expect(boardsApi.renameBoard).toHaveBeenCalledWith(board.id, 'Product')
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(await screen.findByRole('link', { name: 'Product' })).toBeVisible()
      expect(screen.queryByRole('link', { name: 'Design' })).toBeNull()
    })

    it('renames from the menu after an edit was canceled', async () => {
      const board = designBoard()
      const boardsApi = fakeBoardsApi([board])
      renderRoute(`/boards/${board.id}`, { boardsApi })

      const title = await heading('Design')
      fireEvent.click(within(title).getByRole('button', { name: 'Design' }))
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Board name' }), {
        key: 'Escape'
      })
      await heading('Design')
      fireEvent.click(screen.getByRole('button', { name: 'Board options' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename board' }))
      const field = await screen.findByRole('textbox', { name: 'Board name' })
      fireEvent.change(field, { target: { value: 'Product' } })
      fireEvent.keyDown(field, { key: 'Enter' })

      await heading('Product')
      expect(boardsApi.renameBoard).toHaveBeenCalledWith(board.id, 'Product')
    })

    it('keeps the editor open when the menu gives the focus back', async () => {
      const board = designBoard()
      const boardsApi = fakeBoardsApi([board])
      renderRoute(`/boards/${board.id}`, { boardsApi })

      await heading('Design')
      const options = screen.getByRole('button', { name: 'Board options' })
      act(() => {
        options.focus()
      })
      fireEvent.click(options)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename board' }))
      const field = await screen.findByRole('textbox', { name: 'Board name' })
      await waitFor(() => {
        expect(field).toHaveFocus()
      })
      await new Promise(resolve => setTimeout(resolve, 300))
      const typed = screen.getByRole('textbox', { name: 'Board name' })
      fireEvent.change(typed, { target: { value: 'Product' } })
      fireEvent.keyDown(typed, { key: 'Enter' })

      await heading('Product')
      expect(boardsApi.renameBoard).toHaveBeenCalledWith(board.id, 'Product')
    })

    it('renames from the title, saving on blur', async () => {
      const board = designBoard()
      const boardsApi = fakeBoardsApi([board])
      renderRoute(`/boards/${board.id}`, { boardsApi })

      const title = await heading('Design')
      fireEvent.click(within(title).getByRole('button', { name: 'Design' }))
      const field = screen.getByRole('textbox', { name: 'Board name' })
      fireEvent.change(field, { target: { value: 'Product' } })
      fireEvent.blur(field)

      await heading('Product')
      expect(boardsApi.renameBoard).toHaveBeenCalledTimes(1)
    })

    it('restores the title on Escape without saving', async () => {
      const board = designBoard()
      const boardsApi = fakeBoardsApi([board])
      renderRoute(`/boards/${board.id}`, { boardsApi })

      const title = await heading('Design')
      fireEvent.click(within(title).getByRole('button', { name: 'Design' }))
      const field = screen.getByRole('textbox', { name: 'Board name' })
      fireEvent.change(field, { target: { value: 'Product' } })
      fireEvent.keyDown(field, { key: 'Escape' })

      await heading('Design')
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(boardsApi.renameBoard).not.toHaveBeenCalled()
    })

    it('saves nothing for an empty or unchanged name', async () => {
      const board = designBoard()
      const boardsApi = fakeBoardsApi([board])
      renderRoute(`/boards/${board.id}`, { boardsApi })

      for (const value of ['   ', 'Design']) {
        const title = await heading('Design')
        fireEvent.click(within(title).getByRole('button', { name: 'Design' }))
        const field = screen.getByRole('textbox', { name: 'Board name' })
        fireEvent.change(field, { target: { value } })
        fireEvent.keyDown(field, { key: 'Enter' })
        await heading('Design')
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      }
      expect(boardsApi.renameBoard).not.toHaveBeenCalled()
    })

    it('keeps the editor and the typed name when it fails', async () => {
      const board = designBoard()
      const boardsApi = fakeBoardsApi([board])
      boardsApi.renameBoard.mockRejectedValue(new ApiError(500, 'oops'))
      renderRoute(`/boards/${board.id}`, { boardsApi })

      const title = await heading('Design')
      fireEvent.click(within(title).getByRole('button', { name: 'Design' }))
      const field = screen.getByRole('textbox', { name: 'Board name' })
      fireEvent.change(field, { target: { value: 'Product' } })
      fireEvent.keyDown(field, { key: 'Enter' })

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The board could not be renamed.'
      )
      expect(screen.getByRole('textbox', { name: 'Board name' })).toHaveValue(
        'Product'
      )
    })

    it('offers a viewer, an archived board and the inbox no rename', async () => {
      for (const changes of [
        { role: 'viewer' as const },
        { archived: true },
        { inbox: true }
      ]) {
        const board = { ...designBoard(), ...changes }
        const { unmount } = renderRoute(`/boards/${board.id}`, {
          boardsApi: fakeBoardsApi([board])
        })

        const title = await heading('Design')
        expect(within(title).queryByRole('button')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Board options' }))
        expect(
          screen.queryByRole('menuitem', { name: 'Rename board' })
        ).toBeNull()
        unmount()
      }
    })
  })
})
