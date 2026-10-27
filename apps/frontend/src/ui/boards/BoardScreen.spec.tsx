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

const dragAnnouncement = () =>
  document.querySelector('[id^="DndLiveRegion"]')?.textContent

const announcedOnPickUp = async (handle: Element | null) => {
  if (!handle) return undefined
  fireEvent.keyDown(handle, { key: ' ', code: 'Space' })
  await act(() => new Promise(resolve => setTimeout(resolve, 50)))
  const announced = dragAnnouncement()
  fireEvent.keyDown(handle, { key: 'Escape', code: 'Escape' })
  return announced
}

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

  it('titles a board opened from the boards with its name while it loads', async () => {
    const board = designBoard()
    const boardsApi = fakeBoardsApi([board])
    boardsApi.getBoard.mockReturnValue(new Promise(() => undefined))
    renderRoute('/', { boardsApi })

    fireEvent.click(await screen.findByRole('link', { name: /Design/ }))

    const breadcrumb = await screen.findByRole('navigation', {
      name: 'Where the page is'
    })
    expect(
      within(breadcrumb).getByRole('heading', { level: 1, name: 'Design' })
    ).toBeInTheDocument()
    expect(within(breadcrumb).queryByText('…')).toBe(null)
    const boards = within(breadcrumb).getByRole('link', { name: 'Boards' })
    expect(boards).toHaveTextContent(/^$/)
    expect(boards.querySelector('svg')).not.toBe(null)
  })

  it('starts the breadcrumb of an archived board from the Archives', async () => {
    const board = { ...designBoard(), archived: true }
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    await screen.findByRole('heading', { level: 1, name: 'Design' })
    const breadcrumb = screen.getByRole('navigation', {
      name: 'Where the page is'
    })
    expect(
      within(breadcrumb).getByRole('link', { name: 'Archives' })
    ).toHaveAttribute('href', '/archives')
    expect(within(breadcrumb).queryByRole('link', { name: 'Boards' })).toBe(
      null
    )
  })

  describe('the name of a board', () => {
    const name = 'ux-audit-6 Website relaunch, content and design review'
    const title = async (role: 'admin' | 'viewer') => {
      const board = { ...designBoard(), name, role }
      renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })
      const heading = await screen.findByRole('heading', { level: 1, name })
      return within(heading).queryByRole('button') ?? heading
    }

    it.each(['admin', 'viewer'] as const)(
      'shows in full on hover when its ellipsis cuts it, for an %s',
      async role => {
        const shown = await title(role)
        Object.defineProperty(shown, 'scrollWidth', { value: 400 })
        Object.defineProperty(shown, 'clientWidth', { value: 200 })

        fireEvent.mouseOver(shown)

        expect(await screen.findByRole('tooltip')).toHaveTextContent(name)
      }
    )

    it('keeps the rename hint of a name that fits', async () => {
      fireEvent.mouseOver(await title('admin'))

      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        /^Rename board$/
      )
    })

    it('has no tooltip on a name that fits', async () => {
      fireEvent.mouseOver(await title('viewer'))

      await new Promise(resolve => setTimeout(resolve, 300))
      expect(screen.queryByRole('tooltip')).toBe(null)
    })
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

  it('lets admins pick a section up by its header, from the keyboard too', async () => {
    const board = designBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'To do'
    })
    const handle = heading.parentElement
    expect(handle).toHaveAttribute('aria-roledescription', 'draggable section')
    expect(handle).toHaveAttribute('tabindex', '0')
  })

  it('announces a card picked up from the keyboard', async () => {
    const board = designBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const logo = await screen.findByRole('article', { name: 'DES-1 Logo' })
    expect(await announcedOnPickUp(logo)).toBe('Picked up DES-1 Logo.')
  })

  it('leaves Enter and Space to the title and the menu of a card', async () => {
    const board = designBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const logo = await screen.findByRole('article', { name: 'DES-1 Logo' })
    const title = within(logo).getByRole('button', { name: 'Logo' })
    const options = within(logo).getByRole('button', {
      name: 'Options for DES-1'
    })

    expect(fireEvent.keyDown(title, { key: 'Enter', code: 'Enter' })).toBe(true)
    expect(fireEvent.keyDown(options, { key: 'Enter', code: 'Enter' })).toBe(
      true
    )
    expect(fireEvent.keyDown(options, { key: ' ', code: 'Space' })).toBe(true)
    expect(dragAnnouncement()).not.toContain('Picked up')
  })

  it('announces a section picked up from the keyboard', async () => {
    const board = designBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'In progress'
    })
    expect(await announcedOnPickUp(heading.parentElement)).toBe(
      'Picked up the section In progress.'
    )
  })

  it('leaves Enter to the menu in a section header', async () => {
    const board = designBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const options = await screen.findByRole('button', {
      name: 'Options for To do'
    })
    expect(fireEvent.keyDown(options, { key: 'Enter', code: 'Enter' })).toBe(
      true
    )
  })

  it('keeps the sections in place for an editor', async () => {
    const board = { ...designBoard(), role: 'editor' as const }
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'To do'
    })
    expect(heading.parentElement).not.toHaveAttribute('aria-roledescription')
  })

  it('keeps cards in place for a viewer', async () => {
    const board = { ...designBoard(), role: 'viewer' as const }
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const logo = await screen.findByRole('article', { name: 'DES-1 Logo' })
    expect(logo).not.toHaveAttribute('aria-roledescription')
    expect(logo).not.toHaveAttribute('tabindex')
  })

  it('lets editors pick a row of the list up from the keyboard', async () => {
    const board = { ...designBoard(), layout: 'list' as const }
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const logo = await screen.findByRole('listitem', { name: 'DES-1 Logo' })
    expect(logo).toHaveAttribute('aria-roledescription', 'draggable task')
    expect(logo).toHaveAttribute('tabindex', '0')
    expect(
      document.getElementById(logo.getAttribute('aria-describedby') ?? '')
    ).toHaveTextContent('To move a task, press space or enter.')
  })

  it('leaves Enter to the title of a row', async () => {
    const board = { ...designBoard(), layout: 'list' as const }
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const logo = await screen.findByRole('listitem', { name: 'DES-1 Logo' })
    const title = within(logo).getByRole('button', { name: 'Logo' })

    expect(within(logo).queryByRole('checkbox')).toBeNull()
    expect(fireEvent.keyDown(title, { key: 'Enter', code: 'Enter' })).toBe(true)
  })

  it('keeps the rows of the list in place for a viewer', async () => {
    const board = {
      ...designBoard(),
      layout: 'list' as const,
      role: 'viewer' as const
    }
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const logo = await screen.findByRole('listitem', { name: 'DES-1 Logo' })
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

  it('shows the people invited to the board as not assignable yet', async () => {
    const board = designBoard()
    const boardsApi = fakeBoardsApi([board])
    await boardsApi.invite(board.id, 'zoe@acme.example', 'editor')
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Options for DES-2' })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Assign' }))
    const picker = within(
      await screen.findByRole('dialog', { name: 'Assign DES-2' })
    )
    fireEvent.change(picker.getByRole('textbox', { name: 'Search people' }), {
      target: { value: 'zo' }
    })

    expect(
      await picker.findByRole('menuitem', { name: /zoe@acme.example/ })
    ).toHaveAttribute('aria-disabled', 'true')
    expect(picker.getByText('Invited, not joined yet')).toBeVisible()
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
    // A section is named only, with no type to pick.
    expect(dialog.queryByRole('combobox')).toBeNull()
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('region', { name: 'Review' })).toBeVisible()
    expect(boardsApi.createSection).toHaveBeenCalledWith(board.id, {
      name: 'Review',
      category: 'unstarted'
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

  it('shows where the board is, from the boards', async () => {
    const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Design' })
    ).toHaveAttribute('aria-current', 'page')
    const crumbs = within(
      screen.getByRole('navigation', { name: 'Where the page is' })
    )
    expect(crumbs.getByRole('link', { name: 'Boards' })).toHaveAttribute(
      'href',
      '/'
    )
  })

  it('says when the board does not exist', async () => {
    const boardsApi = fakeBoardsApi()
    boardsApi.getBoard.mockRejectedValue(new ApiError(404, 'not_found'))
    renderRoute('/boards/00000000-0000-7000-8000-000000000000', { boardsApi })

    expect(
      await screen.findByText("This board doesn't exist, or you can't open it.")
    ).toBeInTheDocument()
    expect(
      within(
        screen.getByRole('navigation', { name: 'Where the page is' })
      ).getByRole('link', { name: 'Boards' })
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

    it('shows the people invited as the members, as Twake Drive', async () => {
      const board = { ...designBoard(), invited: ['carol@example.com'] }
      renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

      const stack = await screen.findByRole('button', {
        name: '2 members, 1 invited'
      })
      expect(stack).toHaveTextContent(/CA$/)
    })

    it.each([
      [
        'a viewer',
        () => ({ role: 'viewer' as const }),
        'Only an admin can share this board.'
      ],
      [
        'a personal project',
        () => ({ project: aProject({ personal: true }) }),
        'A board of your personal project is private. Move it to a project to share it.'
      ]
    ])('lists the members read-only for %s', async (_name, overrides, why) => {
      const board = { ...designBoard(), ...overrides() }
      renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

      fireEvent.click(await screen.findByRole('button', { name: '2 members' }))

      const dialog = within(
        await screen.findByRole('dialog', { name: 'People with access' })
      )
      expect(dialog.getByText(why)).toBeVisible()
      expect(dialog.getByText('Alice Martin')).toBeVisible()
      expect(dialog.getByText('bob.durand@example.com')).toBeVisible()
      expect(dialog.queryByRole('button', { name: /^Role/ })).toBeNull()
    })

    it.each([
      [
        'viewer' as const,
        'Viewer',
        'You can view tasks, comment and set your own reminders.'
      ],
      [
        'editor' as const,
        'Editor',
        'You can add, edit and move tasks. Admins manage sections, sharing and the board.'
      ]
    ])('tells a %s their role and what it allows', async (role, chip, hint) => {
      const board = { ...designBoard(), role }
      renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

      const button = await screen.findByRole('button', { name: chip })
      fireEvent.keyDown(document.body, { key: 'Tab' })
      act(() => {
        button.focus()
      })
      const tooltip = await screen.findByRole('tooltip')
      expect(tooltip).toHaveTextContent(hint)
      expect(button).toHaveAccessibleDescription(hint)

      fireEvent.click(button)
      expect(
        await screen.findByRole('dialog', { name: 'People with access' })
      ).toBeVisible()
    })

    it('shows an admin no role chip', async () => {
      const board = designBoard()
      renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

      await screen.findByRole('button', { name: '2 members' })
      expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Editor' })).toBeNull()
    })

    // The person signed in, as the session knows them.
    const me = { userId: 'me', email: 'alice@example.com', name: 'Alice' }

    it('leaves the person out of it, as Twake Drive does', async () => {
      const board = aBoard({ members: [me, bob] })
      renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

      const stack = await screen.findByRole('button', { name: '2 members' })
      expect(stack).not.toHaveTextContent('A')
    })

    it('shows none on a board of the person alone', async () => {
      const board = aBoard({ name: 'Mine', members: [me] })
      renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

      await screen.findByRole('heading', { level: 1, name: 'Mine' })
      expect(screen.queryByRole('button', { name: '1 member' })).toBeNull()
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
      expect(stack).toHaveTextContent(/\+3$/)
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

      // The board is in the sidebar twice: under Boards and in the favorites.
      const sidebarLinks = (name: string) =>
        within(screen.getByRole('complementary')).queryAllByRole('link', {
          name
        })
      await heading('Design')
      fireEvent.click(screen.getByRole('button', { name: 'Unfold boards' }))
      await waitFor(() => {
        expect(sidebarLinks('Design')).toHaveLength(2)
      })
      fireEvent.click(screen.getByRole('button', { name: 'Board options' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename board' }))
      const field = await screen.findByRole('textbox', { name: 'Board name' })
      expect(field).toHaveValue('Design')
      fireEvent.change(field, { target: { value: '  Product  ' } })
      fireEvent.keyDown(field, { key: 'Enter' })

      await heading('Product')
      expect(boardsApi.renameBoard).toHaveBeenCalledWith(board.id, 'Product')
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      await waitFor(() => {
        expect(sidebarLinks('Product')).toHaveLength(2)
      })
      expect(sidebarLinks('Design')).toHaveLength(0)
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
