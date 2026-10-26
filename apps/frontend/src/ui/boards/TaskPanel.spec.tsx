import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/application/boards'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { onAPhone } from '@/testing/phone'
import { renderRoute } from '@/testing/renderWithProviders'
import { typeRichText } from '@/testing/richText'

function logoBoard() {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
  const logo = aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
  board.tasks = [logo]
  const boardsApi = fakeBoardsApi([board])
  boardsApi.descriptions.set(logo.id, {
    markdown: 'Use the **new** palette.',
    version: 3
  })
  return { board, logo, boardsApi }
}

async function openLogo() {
  fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
  return within(await screen.findByRole('dialog', { name: 'DES-1 Logo' }))
}

describe('TaskPanel', () => {
  it('completes the task from its header, then reopens it', async () => {
    const { board, logo, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    const complete = panel.getByRole('button', { name: 'Mark complete' })
    expect(complete).toHaveTextContent('Mark complete')
    fireEvent.click(complete)

    await waitFor(() => {
      expect(boardsApi.moveTask).toHaveBeenCalledWith(board.id, logo.id, {
        sectionId: board.sections[2]?.id
      })
    })
    const completed = await panel.findByRole('button', { name: 'Completed' })
    expect(completed).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(completed)

    await waitFor(() => {
      expect(boardsApi.moveTask).toHaveBeenLastCalledWith(board.id, logo.id, {
        sectionId: board.sections[0]?.id
      })
    })
    expect(
      await panel.findByRole('button', { name: 'Mark complete' })
    ).toBeEnabled()
  })

  it('completes from an icon on a phone, named by its action', async () => {
    onAPhone()
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    const complete = panel.getByRole('button', { name: 'Mark complete' })
    expect(complete).toHaveTextContent('')
    fireEvent.click(complete)

    expect(
      await panel.findByRole('button', { name: 'Mark incomplete' })
    ).toHaveTextContent('')
  })

  it('says why a board without a Done section cannot complete the task', async () => {
    const { board, boardsApi } = logoBoard()
    board.sections = board.sections.filter(
      section => section.category !== 'completed'
    )
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    const button = panel.getByRole('button', { name: 'Mark complete' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(button)
    fireEvent.mouseOver(button)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'This board has no Done section.'
    )
    expect(boardsApi.moveTask).not.toHaveBeenCalled()
  })

  it('shows the description as formatted text', async () => {
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()

    expect(await panel.findByText('new', { selector: 'strong' })).toBeVisible()
    // A filled description needs no title on screen, only for screen readers.
    expect(panel.getByRole('heading', { name: 'Description' })).toHaveClass(
      'u-visuallyhidden'
    )
  })

  it('titles an empty description, which has nothing to show instead', async () => {
    const { board, logo, boardsApi } = logoBoard()
    boardsApi.descriptions.delete(logo.id)
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()

    expect(await panel.findByText('No description.')).toBeVisible()
    expect(panel.getByRole('heading', { name: 'Description' })).not.toHaveClass(
      'u-visuallyhidden'
    )
  })

  it('edits the description from the version it started from', async () => {
    const { board, logo, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    fireEvent.click(
      await panel.findByRole('button', { name: 'Edit description' })
    )
    const editor = await panel.findByRole('textbox', { name: 'Description' })
    expect(editor.querySelector('strong')).toHaveTextContent('new')
    await typeRichText(editor, 'Brief')
    fireEvent.click(panel.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(panel.queryByRole('textbox', { name: 'Description' })).toBeNull()
    })
    expect(panel.getByText('Brief')).toBeVisible()
    expect(boardsApi.setDescription).toHaveBeenCalledWith(board.id, logo.id, {
      markdown: 'Brief',
      version: 3
    })
  })

  describe('emoji in the description', () => {
    async function editDescription() {
      const { board, logo, boardsApi } = logoBoard()
      renderRoute(`/boards/${board.id}`, { boardsApi })
      const panel = await openLogo()
      fireEvent.click(
        await panel.findByRole('button', { name: 'Edit description' })
      )
      const editor = await panel.findByRole('textbox', { name: 'Description' })
      const form = editor.closest('form')
      if (!form) throw new Error('The description editor has no form')
      editor.focus()
      return { board, logo, boardsApi, panel, editor, form: within(form) }
    }

    it('suggests emoji as :name is typed and saves the one chosen', async () => {
      const { board, logo, boardsApi, panel, editor } = await editDescription()

      // The names load in the background, after the first keystrokes of a test.
      const list = await waitFor(async () => {
        await typeRichText(editor, 'Ready :rocket')
        return screen.getByRole('listbox', { name: 'Emoji' })
      })
      fireEvent.click(within(list).getByRole('option', { name: 'rocket' }))
      await waitFor(() => {
        expect(editor.textContent).toBe('Ready 🚀')
      })
      fireEvent.click(panel.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(boardsApi.setDescription).toHaveBeenCalledWith(
          board.id,
          logo.id,
          { markdown: 'Ready 🚀', version: 3 }
        )
      })
    })

    it('inserts the emoji picked from the button', async () => {
      const { editor, form } = await editDescription()
      await typeRichText(editor, 'Ready ')

      fireEvent.click(form.getByRole('button', { name: 'Emoji' }))
      fireEvent.change(await screen.findByLabelText('Search emoji'), {
        target: { value: 'rocket' }
      })
      fireEvent.click(
        within(screen.getByRole('group', { name: 'Emoji' })).getByRole(
          'button',
          { name: 'rocket' }
        )
      )

      await waitFor(() => {
        expect(editor).toHaveTextContent('Ready 🚀')
      })
    })
  })

  it('keeps the draft when someone else changed the description', async () => {
    const { board, boardsApi } = logoBoard()
    boardsApi.setDescription.mockRejectedValueOnce(
      new ApiError(409, 'stale_version')
    )
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    fireEvent.click(
      await panel.findByRole('button', { name: 'Edit description' })
    )
    await typeRichText(
      await panel.findByRole('textbox', { name: 'Description' }),
      'Mine'
    )
    fireEvent.click(panel.getByRole('button', { name: 'Save' }))

    expect(
      await panel.findByText(
        'Someone else changed the description. Your text is kept: save again to replace theirs.'
      )
    ).toBeInTheDocument()
    expect(
      panel.getByRole('textbox', { name: 'Description' })
    ).toHaveTextContent('Mine')
  })

  it('refuses to overwrite a description saved elsewhere while editing', async () => {
    const { board, logo, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    fireEvent.click(
      await panel.findByRole('button', { name: 'Edit description' })
    )
    await typeRichText(
      await panel.findByRole('textbox', { name: 'Description' }),
      'Mine'
    )
    const reads = boardsApi.getDescription.mock.calls.length
    act(() => {
      boardsApi.descriptions.set(logo.id, { markdown: 'Theirs', version: 4 })
      boardsApi.changeElsewhere(board.id, () => undefined)
    })
    await waitFor(() => {
      expect(boardsApi.getDescription.mock.calls.length).toBeGreaterThan(reads)
    })
    fireEvent.click(panel.getByRole('button', { name: 'Save' }))

    expect(
      await panel.findByText(
        'Someone else changed the description. Your text is kept: save again to replace theirs.'
      )
    ).toBeInTheDocument()
    expect(boardsApi.descriptions.get(logo.id)?.markdown).toBe('Theirs')

    await waitFor(() => {
      expect(panel.getByRole('button', { name: 'Save' })).toBeEnabled()
    })
    fireEvent.click(panel.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(boardsApi.descriptions.get(logo.id)).toEqual({
        markdown: 'Mine',
        version: 5
      })
    })
  })

  it('keeps the panel and the typed text when Escape is pressed in a field', async () => {
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    fireEvent.click(
      await panel.findByRole('button', { name: 'Edit description' })
    )
    const editor = await panel.findByRole('textbox', { name: 'Description' })
    await typeRichText(editor, 'Half typed')
    editor.focus()
    fireEvent.keyDown(editor, { key: 'Escape' })

    expect(screen.getByRole('dialog', { name: 'DES-1 Logo' })).toBeVisible()
    expect(
      panel.getByRole('textbox', { name: 'Description' })
    ).toHaveTextContent('Half typed')
  })

  it('closes the panel on Escape outside a field', async () => {
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    fireEvent.keyDown(panel.getByRole('button', { name: 'Edit description' }), {
      key: 'Escape'
    })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'DES-1 Logo' })).toBeNull()
    })
  })

  it('renames the task in place', async () => {
    const { board, logo, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    const title = panel.getByRole('textbox', { name: 'Title' })
    fireEvent.change(title, { target: { value: 'Logo v2' } })
    fireEvent.blur(title)

    await waitFor(() => {
      expect(boardsApi.editTask).toHaveBeenCalledWith(board.id, logo.id, {
        title: 'Logo v2'
      })
    })
  })

  it('sets the priority from its row', async () => {
    const { board, logo, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    fireEvent.mouseDown(panel.getByRole('combobox', { name: 'Priority' }))
    // Each one shown as on a card.
    const option = await screen.findByRole('option', { name: 'Priority 2' })
    expect(option).toHaveTextContent('P2')
    fireEvent.click(option)

    await waitFor(() => {
      expect(boardsApi.editTask).toHaveBeenCalledWith(board.id, logo.id, {
        priority: 2
      })
    })
  })

  it('shows the priority as on its card, with its flag and colour', async () => {
    const { board, logo, boardsApi } = logoBoard()
    logo.priority = 1
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()

    expect(
      within(panel.getByRole('combobox', { name: 'Priority' })).getByRole(
        'img',
        { name: 'Priority 1' }
      )
    ).toHaveTextContent('P1')
  })

  it('moves the task to another section from its row', async () => {
    const { board, logo, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    fireEvent.mouseDown(panel.getByRole('combobox', { name: 'Section' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Done' }))

    await waitFor(() => {
      expect(boardsApi.moveTask).toHaveBeenCalledWith(board.id, logo.id, {
        sectionId: board.sections[2]?.id
      })
    })
  })

  it('lists the assignees and labels', async () => {
    const { board, logo, boardsApi } = logoBoard()
    Object.assign(logo, {
      assignees: [{ userId: 'ann', email: 'ann@example.com' }],
      labels: [{ id: 'l1', name: 'Urgent' }]
    })
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()

    expect(panel.getByText('ann@example.com')).toBeVisible()
    expect(panel.getByText('Urgent')).toBeVisible()
    expect(
      panel.getByRole('button', { name: 'Add assignees' })
    ).toBeInTheDocument()
    expect(
      panel.getByRole('button', { name: 'Add labels' })
    ).toBeInTheDocument()
  })

  it('reads the properties between the title and the description', async () => {
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    const description = await panel.findByText('new', { selector: 'strong' })
    const title = panel.getByRole('textbox', { name: 'Title' })
    const priority = panel.getByRole('combobox', { name: 'Priority' })

    expect(title.compareDocumentPosition(priority)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    expect(priority.compareDocumentPosition(description)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
  })

  it('names its board first, as plain text on that board', async () => {
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    const terms = panel.getAllByRole('term')

    expect(terms[0]).toHaveTextContent('Board')
    const value = within(terms[0]?.nextElementSibling as HTMLElement)
    expect(value.getByText('Design')).toBeVisible()
    expect(value.queryByRole('link')).toBeNull()
  })

  it('names an assignee in full in a tooltip', async () => {
    const { board, logo, boardsApi } = logoBoard()
    Object.assign(logo, {
      assignees: [
        { userId: 'bob', email: 'bob@example.com', name: 'Bob Dylan' }
      ]
    })
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    fireEvent.mouseOver(panel.getByText('Bob Dylan'))

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Bob Dylan')
  })

  it('takes a label off with the cross of its chip', async () => {
    const { board, logo, boardsApi } = logoBoard()
    Object.assign(logo, {
      labels: [
        { id: 'l1', name: 'Urgent', color: null },
        { id: 'l2', name: 'Client', color: null }
      ]
    })
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    fireEvent.click(
      panel.getByRole('button', { name: 'Remove the label Urgent' })
    )

    await waitFor(() => {
      expect(boardsApi.setLabels).toHaveBeenCalledWith(board.id, logo.id, [
        'l2'
      ])
    })
  })

  it('assigns from the panel without a save step', async () => {
    const { board, logo, boardsApi } = logoBoard()
    board.members = [{ userId: 'ann', email: 'ann@example.com', name: null }]
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    fireEvent.click(panel.getByRole('button', { name: 'Add assignees' }))
    fireEvent.click(
      within(
        await screen.findByRole('dialog', { name: 'Assign DES-1' })
      ).getByRole('menuitemcheckbox', { name: 'ann@example.com' })
    )

    expect(await panel.findByText('ann@example.com')).toBeVisible()
    expect(boardsApi.setAssignees).toHaveBeenCalledWith(board.id, logo.id, [
      'ann'
    ])
  })

  it('lists the sub-tasks and completes one', async () => {
    const { board, logo, boardsApi } = logoBoard()
    const sketch = aTask(null, {
      key: 'DES-2',
      title: 'Sketch',
      parentId: logo.id
    })
    board.tasks.push(sketch)
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    const subtasks = within(panel.getByRole('list', { name: 'Sub-tasks' }))
    fireEvent.click(subtasks.getByRole('checkbox', { name: 'Sketch' }))

    await waitFor(() => {
      expect(boardsApi.completeTask).toHaveBeenCalledWith(
        board.id,
        sketch.id,
        'completed'
      )
    })
  })

  it('closes from its close button', async () => {
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    fireEvent.click(panel.getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('asks before closing over an unsaved description', async () => {
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    fireEvent.click(
      await panel.findByRole('button', { name: 'Edit description' })
    )
    await typeRichText(
      await panel.findByRole('textbox', { name: 'Description' }),
      'Half typed'
    )
    fireEvent.click(panel.getByRole('button', { name: 'Close' }))
    const ask = within(
      await screen.findByRole('dialog', { name: 'Discard your changes?' })
    )
    fireEvent.click(ask.getByRole('button', { name: 'Keep editing' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Discard your changes?' })
      ).toBeNull()
    })
    expect(
      panel.getByRole('textbox', { name: 'Description' })
    ).toHaveTextContent('Half typed')

    fireEvent.click(panel.getByRole('button', { name: 'Close' }))
    fireEvent.click(
      within(
        await screen.findByRole('dialog', { name: 'Discard your changes?' })
      ).getByRole('button', { name: 'Discard' })
    )

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'DES-1 Logo' })).toBeNull()
    })
  })

  it('asks before Escape closes over an unsaved comment', async () => {
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    await typeRichText(
      await panel.findByRole('textbox', { name: 'Comment' }),
      'Comment draft'
    )
    fireEvent.keyDown(panel.getByRole('button', { name: 'Close' }), {
      key: 'Escape'
    })

    const ask = await screen.findByRole('dialog', {
      name: 'Discard your changes?'
    })
    fireEvent.keyDown(ask, { key: 'Escape' })

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Discard your changes?' })
      ).toBeNull()
    })
    expect(panel.getByRole('textbox', { name: 'Comment' })).toHaveTextContent(
      'Comment draft'
    )
  })

  it('keeps the comment draft across a look at the history', async () => {
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    await typeRichText(
      await panel.findByRole('textbox', { name: 'Comment' }),
      'Comment draft'
    )
    fireEvent.click(panel.getByRole('tab', { name: 'History' }))
    fireEvent.click(panel.getByRole('tab', { name: 'Comments' }))

    expect(panel.getByRole('textbox', { name: 'Comment' })).toHaveTextContent(
      'Comment draft'
    )
  })

  it('asks before closing over an unsaved sub-task', async () => {
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    fireEvent.click(panel.getByRole('button', { name: 'Add a sub-task' }))
    fireEvent.change(panel.getByRole('textbox', { name: 'Sub-task title' }), {
      target: { value: 'Sub draft' }
    })
    fireEvent.click(panel.getByRole('button', { name: 'Close' }))

    expect(
      await screen.findByRole('dialog', { name: 'Discard your changes?' })
    ).toBeVisible()
  })

  it('offers no edit to a viewer', async () => {
    const { board, boardsApi } = logoBoard()
    board.role = 'viewer'
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()

    expect(await panel.findByText('new')).toBeVisible()
    expect(
      panel.queryByRole('button', { name: 'Edit description' })
    ).not.toBeInTheDocument()
    expect(panel.queryByRole('textbox', { name: 'Title' })).toBeNull()
    expect(panel.getByRole('heading', { name: 'Logo' })).toBeVisible()
  })

  describe('peek', () => {
    it('opens beside the board, whose other tasks open in its place', async () => {
      const { board, boardsApi } = logoBoard()
      board.tasks.push(
        aTask(board.sections[0] ?? null, { key: 'DES-2', title: 'Icons' })
      )
      renderRoute(`/boards/${board.id}`, { boardsApi })

      const panel = await openLogo()
      expect(
        panel.getByRole('navigation', { name: 'Where the task is' })
      ).toHaveTextContent(/^DES-1$/)
      fireEvent.click(screen.getByRole('button', { name: 'Icons' }))

      expect(
        await screen.findByRole('dialog', { name: 'DES-2 Icons' })
      ).toBeVisible()
      expect(screen.queryByRole('dialog', { name: 'DES-1 Logo' })).toBeNull()
    })

    it('closes on a click on the board beside it, not on a full page', async () => {
      const { board, boardsApi } = logoBoard()
      renderRoute(`/boards/${board.id}`, { boardsApi })

      const panel = await openLogo()
      fireEvent.click(panel.getByRole('button', { name: 'Open as full page' }))
      fireEvent.click(screen.getByRole('main'))
      expect(screen.getByRole('dialog', { name: 'DES-1 Logo' })).toBeVisible()
      fireEvent.click(panel.getByRole('button', { name: 'Open in side peek' }))
      fireEvent.click(screen.getByRole('main'))

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'DES-1 Logo' })).toBeNull()
      })
    })

    it('closes on Escape on the board beside it', async () => {
      const { board, boardsApi } = logoBoard()
      renderRoute(`/boards/${board.id}`, { boardsApi })

      await openLogo()
      fireEvent.keyDown(screen.getByRole('main'), { key: 'Escape' })

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'DES-1 Logo' })).toBeNull()
      })
    })

    it('asks before another task takes the place of an unsaved one', async () => {
      const { board, boardsApi } = logoBoard()
      board.tasks.push(
        aTask(board.sections[0] ?? null, { key: 'DES-2', title: 'Icons' })
      )
      renderRoute(`/boards/${board.id}`, { boardsApi })

      const panel = await openLogo()
      await typeRichText(
        await panel.findByRole('textbox', { name: 'Comment' }),
        'Comment draft'
      )
      fireEvent.click(screen.getByRole('button', { name: 'Icons' }))

      expect(
        await screen.findByRole('dialog', { name: 'Discard your changes?' })
      ).toBeVisible()
      expect(screen.queryByRole('dialog', { name: 'DES-2 Icons' })).toBeNull()
    })

    it('expands to the full page and back, the link keeping the way', async () => {
      const { board, boardsApi } = logoBoard()
      const { router } = renderRoute(`/boards/${board.id}`, { boardsApi })

      const panel = await openLogo()
      fireEvent.click(panel.getByRole('button', { name: 'Open as full page' }))
      await waitFor(() => {
        expect(router.state.location.search).toBe('?task=DES-1&panel=full')
      })
      fireEvent.click(panel.getByRole('button', { name: 'Open in side peek' }))

      await waitFor(() => {
        expect(router.state.location.search).toBe('?task=DES-1')
      })
    })

    it('opens a full page link expanded, and closes back to a peek', async () => {
      const writeText = vi.fn(() => Promise.resolve())
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true
      })
      const { board, boardsApi } = logoBoard()
      const { router } = renderRoute(
        `/boards/${board.id}?task=DES-1&panel=full`,
        { boardsApi }
      )

      const panel = within(
        await screen.findByRole('dialog', { name: 'DES-1 Logo' })
      )
      fireEvent.click(panel.getByRole('button', { name: 'Copy link' }))
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(
          `${window.location.origin}/boards/${board.id}?task=DES-1&panel=full`
        )
      })
      fireEvent.click(panel.getByRole('button', { name: 'Close' }))

      await waitFor(() => {
        expect(router.state.location.search).toBe('')
      })
    })
  })

  describe('copy link', () => {
    const stubClipboard = (writeText: () => Promise<void>) => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true
      })
    }

    it('opens in the content, its properties in a bar beside it', async () => {
      const { board, boardsApi } = logoBoard()
      renderRoute(`/boards/${board.id}`, { boardsApi })

      const panel = await openLogo()
      expect(screen.getByRole('link', { name: 'My tasks' })).toBeVisible()
      const aside = within(panel.getByRole('complementary'))
      expect(aside.getByText('Assignees')).toBeVisible()
      expect(aside.queryByText('Description')).toBeNull()
      expect(panel.getByText('Description')).toBeVisible()
    })

    it('shows where the task is, from the boards to its key', async () => {
      const { board, boardsApi } = logoBoard()
      renderRoute(`/boards/${board.id}?task=DES-1&panel=full`, { boardsApi })

      const panel = within(
        await screen.findByRole('dialog', { name: 'DES-1 Logo' })
      )
      const crumbs = within(
        panel.getByRole('navigation', { name: 'Where the task is' })
      )
      expect(crumbs.getByRole('link', { name: 'Boards' })).toHaveAttribute(
        'href',
        '/'
      )
      expect(crumbs.getByRole('link', { name: board.name })).toHaveAttribute(
        'href',
        `/boards/${board.id}`
      )
      expect(crumbs.getByText('DES-1')).toHaveAttribute('aria-current', 'page')
    })

    it('unassigns with the cross of a person’s chip', async () => {
      const { board, logo, boardsApi } = logoBoard()
      Object.assign(logo, {
        assignees: [
          { userId: 'ann', email: 'ann@example.com', name: null },
          { userId: 'bob', email: 'bob@example.com', name: null }
        ]
      })
      renderRoute(`/boards/${board.id}`, { boardsApi })

      const panel = await openLogo()
      fireEvent.click(
        panel.getByRole('button', { name: 'Unassign ann@example.com' })
      )

      await waitFor(() => {
        expect(boardsApi.setAssignees).toHaveBeenCalledWith(board.id, logo.id, [
          'bob'
        ])
      })
    })

    it('copies the link of the task and says so', async () => {
      const writeText = vi.fn(() => Promise.resolve())
      stubClipboard(writeText)
      const { board, boardsApi } = logoBoard()
      renderRoute(`/boards/${board.id}`, { boardsApi })

      const panel = await openLogo()
      fireEvent.click(panel.getByRole('button', { name: 'Copy link' }))

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(
          `${window.location.origin}/boards/${board.id}?task=DES-1`
        )
      })
      expect(
        (await screen.findAllByRole('status')).some(status =>
          status.textContent.includes('Link copied')
        )
      ).toBe(true)
    })

    it('writes with the clipboard of the window that was clicked', async () => {
      const own = vi.fn(() => Promise.resolve())
      const other = vi.fn(() => Promise.resolve())
      stubClipboard(other)
      const { board, boardsApi } = logoBoard()
      renderRoute(`/boards/${board.id}`, { boardsApi })

      const panel = await openLogo()
      const button = panel.getByRole('button', { name: 'Copy link' })
      // The overlay of TwakeSpace is another window than the global one
      const win = window
      const overlay = new Proxy(win, {
        get: (target, name): unknown =>
          name === 'navigator'
            ? { clipboard: { writeText: own } }
            : Reflect.get(target, name, target)
      })
      const view = vi
        .spyOn(button.ownerDocument, 'defaultView', 'get')
        .mockReturnValue(overlay)
      fireEvent.click(button)

      await waitFor(() => {
        expect(own).toHaveBeenCalledTimes(1)
      })
      view.mockRestore()
      expect(other).not.toHaveBeenCalled()
    })

    it('reports a clipboard that refuses', async () => {
      stubClipboard(() => Promise.reject(new Error('denied')))
      const { board, boardsApi } = logoBoard()
      renderRoute(`/boards/${board.id}`, { boardsApi })

      const panel = await openLogo()
      fireEvent.click(panel.getByRole('button', { name: 'Copy link' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The link could not be copied.'
      )
    })

    it('reports a missing clipboard', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        configurable: true
      })
      const { board, boardsApi } = logoBoard()
      renderRoute(`/boards/${board.id}`, { boardsApi })

      const panel = await openLogo()
      fireEvent.click(panel.getByRole('button', { name: 'Copy link' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The link could not be copied.'
      )
    })
  })
})
