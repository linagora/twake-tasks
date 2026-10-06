import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/application/boards'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
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
  it('shows the description as formatted text', async () => {
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()

    expect(await panel.findByText('new', { selector: 'strong' })).toBeVisible()
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
    fireEvent.click(await screen.findByRole('option', { name: 'P2' }))

    await waitFor(() => {
      expect(boardsApi.editTask).toHaveBeenCalledWith(board.id, logo.id, {
        priority: 2
      })
    })
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
      panel.getByRole('button', { name: 'Edit assignees' })
    ).toBeInTheDocument()
    expect(
      panel.getByRole('button', { name: 'Edit labels' })
    ).toBeInTheDocument()
  })

  it('assigns from the panel without a save step', async () => {
    const { board, logo, boardsApi } = logoBoard()
    board.members = [{ userId: 'ann', email: 'ann@example.com' }]
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    fireEvent.click(panel.getByRole('button', { name: 'Edit assignees' }))
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
})
