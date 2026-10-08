import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

describe('moving a task to another board', () => {
  it('moves it into a section of a board I edit', async () => {
    const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
    const logo = aTask(design.sections[0] ?? null, {
      key: 'DES-1',
      title: 'Logo'
    })
    design.tasks = [logo]
    const ops = aBoard({ name: 'Ops', keyPrefix: 'OPS' })
    const hr = aBoard({ name: 'HR', keyPrefix: 'HR', role: 'viewer' })
    const boardsApi = fakeBoardsApi([design, ops, hr])
    renderRoute(`/boards/${design.id}`, { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
    const panel = within(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    )
    fireEvent.click(panel.getByRole('button', { name: 'Task options' }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Move to another board' })
    )
    const form = within(
      await screen.findByRole('form', { name: 'Move to another board' })
    )
    const board = form.getByRole('combobox', { name: 'Board' })
    expect(within(board).queryByRole('option', { name: 'HR' })).toBeNull()
    fireEvent.change(board, { target: { value: ops.id } })
    const section = await form.findByRole('combobox', { name: 'Section' })
    await within(section).findByRole('option', { name: 'In progress' })
    fireEvent.change(section, { target: { value: ops.sections[1]?.id } })
    fireEvent.click(form.getByRole('button', { name: 'Move' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Logo' })).toBeNull()
    })
    expect(boardsApi.transferTask).toHaveBeenCalledWith(design.id, logo.id, {
      boardId: ops.id,
      sectionId: ops.sections[1]?.id
    })
  })

  async function openForm(
    boardsApi: ReturnType<typeof fakeBoardsApi>,
    from: string,
    title: string
  ) {
    renderRoute(`/boards/${from}`, { boardsApi })
    fireEvent.click(await screen.findByRole('button', { name: title }))
    const panel = within(
      await screen.findByRole('dialog', { name: new RegExp(title) })
    )
    fireEvent.click(panel.getByRole('button', { name: 'Task options' }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Move to another board' })
    )
    return within(
      await screen.findByRole('form', { name: 'Move to another board' })
    )
  }

  function setup() {
    const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
    const logo = aTask(design.sections[0] ?? null, {
      key: 'DES-1',
      title: 'Logo'
    })
    design.tasks = [logo]
    const ops = aBoard({ name: 'Ops', keyPrefix: 'OPS' })
    return { design, logo, ops, boardsApi: fakeBoardsApi([design, ops]) }
  }

  it('asks before dropping assignees, and lists them with the labels to create', async () => {
    const { design, logo, ops, boardsApi } = setup()
    boardsApi.previewTransfer.mockResolvedValue({
      droppedAssignees: [
        { userId: 'u1', name: 'Bob', email: 'bob@example.com' },
        { userId: 'u2', name: null, email: 'eve@example.com' }
      ],
      createdLabels: ['Brand']
    })
    const form = await openForm(boardsApi, design.id, 'Logo')

    fireEvent.change(form.getByRole('combobox', { name: 'Board' }), {
      target: { value: ops.id }
    })
    fireEvent.click(form.getByRole('button', { name: 'Move' }))

    const dialog = within(
      await screen.findByRole('dialog', { name: 'Move Logo?' })
    )
    expect(
      dialog.getByTestId('transfer-dropped-assignees').textContent
    ).toContain('Bob, eve@example.com')
    expect(dialog.getByTestId('transfer-created-labels').textContent).toContain(
      'Brand'
    )
    expect(boardsApi.transferTask).not.toHaveBeenCalled()

    fireEvent.click(dialog.getByRole('button', { name: 'Move anyway' }))

    await waitFor(() => {
      expect(boardsApi.transferTask).toHaveBeenCalledWith(design.id, logo.id, {
        boardId: ops.id,
        sectionId: null
      })
    })
  })

  it('does not move when I cancel', async () => {
    const { design, ops, boardsApi } = setup()
    boardsApi.previewTransfer.mockResolvedValue({
      droppedAssignees: [
        { userId: 'u1', name: 'Bob', email: 'bob@example.com' }
      ],
      createdLabels: []
    })
    const form = await openForm(boardsApi, design.id, 'Logo')

    fireEvent.change(form.getByRole('combobox', { name: 'Board' }), {
      target: { value: ops.id }
    })
    fireEvent.click(form.getByRole('button', { name: 'Move' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Move Logo?' })
    )
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Move Logo?' })).toBeNull()
    })
    expect(boardsApi.transferTask).not.toHaveBeenCalled()
  })

  it('moves straight away when only labels get created', async () => {
    const { design, ops, boardsApi } = setup()
    boardsApi.previewTransfer.mockResolvedValue({
      droppedAssignees: [],
      createdLabels: ['Brand']
    })
    const form = await openForm(boardsApi, design.id, 'Logo')

    fireEvent.change(form.getByRole('combobox', { name: 'Board' }), {
      target: { value: ops.id }
    })
    fireEvent.click(form.getByRole('button', { name: 'Move' }))

    await waitFor(() => {
      expect(boardsApi.transferTask).toHaveBeenCalled()
    })
    expect(screen.queryByRole('dialog', { name: 'Move Logo?' })).toBeNull()
  })

  it('shows a failure inside the confirmation, which describes itself', async () => {
    const { design, ops, boardsApi } = setup()
    boardsApi.previewTransfer.mockResolvedValue({
      droppedAssignees: [{ userId: 'u1', name: null, email: null }],
      createdLabels: []
    })
    boardsApi.transferTask.mockRejectedValue(new Error('boom'))
    const form = await openForm(boardsApi, design.id, 'Logo')

    fireEvent.change(form.getByRole('combobox', { name: 'Board' }), {
      target: { value: ops.id }
    })
    fireEvent.click(form.getByRole('button', { name: 'Move' }))
    const dialog = await screen.findByRole('dialog', { name: 'Move Logo?' })
    expect(dialog.getAttribute('aria-describedby')).not.toBeNull()
    expect(
      within(dialog).getByTestId('transfer-dropped-assignees').textContent
    ).toContain('Former member')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move anyway' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The task could not be moved.'
    )
  })

  it('tells me who was unassigned when that differs from the preview', async () => {
    const { design, ops, boardsApi } = setup()
    boardsApi.transferTask.mockResolvedValue({
      key: 'OPS-1',
      droppedAssignees: [
        { userId: 'u1', name: 'Bob', email: 'bob@example.com' }
      ],
      createdLabels: []
    })
    const form = await openForm(boardsApi, design.id, 'Logo')

    fireEvent.change(form.getByRole('combobox', { name: 'Board' }), {
      target: { value: ops.id }
    })
    fireEvent.click(form.getByRole('button', { name: 'Move' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Bob')
    expect(alert.textContent).toContain('were unassigned')
    expect(
      screen.getByRole('form', { name: 'Move to another board' })
    ).toBeTruthy()
  })

  it('moves without a notice when the server dropped nobody the preview named', async () => {
    const { design, ops, boardsApi } = setup()
    boardsApi.previewTransfer.mockResolvedValue({
      droppedAssignees: [
        { userId: 'u1', name: 'Bob', email: 'bob@example.com' }
      ],
      createdLabels: []
    })
    const form = await openForm(boardsApi, design.id, 'Logo')
    fireEvent.change(form.getByRole('combobox', { name: 'Board' }), {
      target: { value: ops.id }
    })
    fireEvent.click(form.getByRole('button', { name: 'Move' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Move Logo?' })
    )
    fireEvent.click(dialog.getByRole('button', { name: 'Move anyway' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Logo' })).toBeNull()
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('forgets a failure when I cancel the confirmation', async () => {
    const { design, ops, boardsApi } = setup()
    boardsApi.previewTransfer.mockResolvedValue({
      droppedAssignees: [
        { userId: 'u1', name: 'Bob', email: 'bob@example.com' }
      ],
      createdLabels: []
    })
    boardsApi.transferTask.mockRejectedValueOnce(new Error('boom'))
    const form = await openForm(boardsApi, design.id, 'Logo')
    fireEvent.change(form.getByRole('combobox', { name: 'Board' }), {
      target: { value: ops.id }
    })

    fireEvent.click(form.getByRole('button', { name: 'Move' }))
    let dialog = await screen.findByRole('dialog', { name: 'Move Logo?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move anyway' }))
    await within(dialog).findByRole('alert')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Move Logo?' })).toBeNull()
    })
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.click(form.getByRole('button', { name: 'Move' }))
    dialog = await screen.findByRole('dialog', { name: 'Move Logo?' })
    expect(within(dialog).queryByRole('alert')).toBeNull()
  })

  it('refreshes the board when the form goes away while the notice is shown', async () => {
    const { design, ops, boardsApi } = setup()
    boardsApi.transferTask.mockImplementation(async (boardId, taskId, to) => {
      const moved = await fakeBoardsApi([design, ops]).transferTask(
        boardId,
        taskId,
        to
      )
      return {
        ...moved,
        droppedAssignees: [
          { userId: 'u1', name: 'Bob', email: 'bob@example.com' }
        ]
      }
    })
    const form = await openForm(boardsApi, design.id, 'Logo')
    fireEvent.change(form.getByRole('combobox', { name: 'Board' }), {
      target: { value: ops.id }
    })
    const loads = boardsApi.getBoard.mock.calls.length

    fireEvent.click(form.getByRole('button', { name: 'Move' }))
    await screen.findByRole('alert')
    expect(boardsApi.getBoard.mock.calls.length).toBe(loads)
    fireEvent.keyDown(
      screen.getByRole('dialog', { name: 'Move to another board' }),
      { key: 'Escape' }
    )

    await waitFor(() => {
      expect(boardsApi.getBoard.mock.calls.length).toBeGreaterThan(loads)
    })
  })

  it('focuses OK when the notice shows', async () => {
    const { design, ops, boardsApi } = setup()
    boardsApi.transferTask.mockResolvedValue({
      key: 'OPS-1',
      droppedAssignees: [
        { userId: 'u1', name: 'Bob', email: 'bob@example.com' }
      ],
      createdLabels: []
    })
    const form = await openForm(boardsApi, design.id, 'Logo')
    fireEvent.change(form.getByRole('combobox', { name: 'Board' }), {
      target: { value: ops.id }
    })

    fireEvent.click(form.getByRole('button', { name: 'Move' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('button', { name: 'OK' })).toBe(
      document.activeElement
    )
  })

  it('names a person without a name or an email a former member', async () => {
    const { design, ops, boardsApi } = setup()
    boardsApi.previewTransfer.mockResolvedValue({
      droppedAssignees: [{ userId: 'u1', name: null, email: '' }],
      createdLabels: []
    })
    const form = await openForm(boardsApi, design.id, 'Logo')
    fireEvent.change(form.getByRole('combobox', { name: 'Board' }), {
      target: { value: ops.id }
    })

    fireEvent.click(form.getByRole('button', { name: 'Move' }))

    const dialog = await screen.findByRole('dialog', { name: 'Move Logo?' })
    expect(
      within(dialog).getByTestId('transfer-dropped-assignees').textContent
    ).toContain('Former member')
  })

  it('does not let me cancel the confirmation while the move is under way', async () => {
    const { design, ops, boardsApi } = setup()
    boardsApi.previewTransfer.mockResolvedValue({
      droppedAssignees: [
        { userId: 'u1', name: 'Bob', email: 'bob@example.com' }
      ],
      createdLabels: []
    })
    let finish: () => void = () => undefined
    boardsApi.transferTask.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = () => {
            resolve({
              key: 'OPS-1',
              droppedAssignees: [
                { userId: 'u2', name: 'Eve', email: 'eve@example.com' }
              ],
              createdLabels: []
            })
          }
        })
    )
    const form = await openForm(boardsApi, design.id, 'Logo')
    fireEvent.change(form.getByRole('combobox', { name: 'Board' }), {
      target: { value: ops.id }
    })
    fireEvent.click(form.getByRole('button', { name: 'Move' }))
    const dialog = await screen.findByRole('dialog', { name: 'Move Logo?' })
    expect(dialog.getAttribute('aria-busy')).toBe('false')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move anyway' }))

    await waitFor(() => {
      expect(
        within(dialog).getByRole('button', { name: 'Cancel' })
      ).toBeDisabled()
    })
    expect(dialog.getAttribute('aria-busy')).toBe('true')
    expect(within(dialog).getByRole('status').textContent).toBe('Moving…')
    expect(document.activeElement).toBe(within(dialog).getByRole('status'))
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Move Logo?' })).toBeTruthy()
    finish()

    const notice = await screen.findByRole('alert')
    expect(within(notice).getByRole('button', { name: 'OK' })).toBe(
      document.activeElement
    )
  })

  it('refreshes the board when the form goes away during the move', async () => {
    const { design, ops, boardsApi } = setup()
    let finish: () => void = () => undefined
    boardsApi.transferTask.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = () => {
            resolve({ key: 'OPS-1', droppedAssignees: [], createdLabels: [] })
          }
        })
    )
    const form = await openForm(boardsApi, design.id, 'Logo')
    fireEvent.change(form.getByRole('combobox', { name: 'Board' }), {
      target: { value: ops.id }
    })
    const loads = boardsApi.getBoard.mock.calls.length
    fireEvent.click(form.getByRole('button', { name: 'Move' }))
    await waitFor(() => {
      expect(boardsApi.transferTask).toHaveBeenCalled()
    })
    fireEvent.keyDown(
      screen.getByRole('dialog', { name: 'Move to another board' }),
      { key: 'Escape' }
    )
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Move to another board' })
      ).toBeNull()
    })
    finish()

    await waitFor(() => {
      expect(boardsApi.getBoard.mock.calls.length).toBeGreaterThan(loads)
    })
  })

  it('shows no stale failure when a retry opens the confirmation', async () => {
    const { design, ops, boardsApi } = setup()
    boardsApi.transferTask.mockRejectedValueOnce(new Error('boom'))
    const form = await openForm(boardsApi, design.id, 'Logo')
    fireEvent.change(form.getByRole('combobox', { name: 'Board' }), {
      target: { value: ops.id }
    })
    fireEvent.click(form.getByRole('button', { name: 'Move' }))
    await screen.findByText('The task could not be moved.')
    boardsApi.previewTransfer.mockResolvedValue({
      droppedAssignees: [
        { userId: 'u1', name: 'Bob', email: 'bob@example.com' }
      ],
      createdLabels: []
    })

    fireEvent.click(form.getByRole('button', { name: 'Move' }))

    const dialog = await screen.findByRole('dialog', { name: 'Move Logo?' })
    expect(within(dialog).queryByRole('alert')).toBeNull()
  })

  it('refreshes the board once when a move fails after the form is gone', async () => {
    const { design, ops, boardsApi } = setup()
    let fail: () => void = () => undefined
    boardsApi.transferTask.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = () => {
            reject(new Error('boom'))
          }
        })
    )
    const form = await openForm(boardsApi, design.id, 'Logo')
    fireEvent.change(form.getByRole('combobox', { name: 'Board' }), {
      target: { value: ops.id }
    })
    fireEvent.click(form.getByRole('button', { name: 'Move' }))
    await waitFor(() => {
      expect(boardsApi.transferTask).toHaveBeenCalled()
    })
    fireEvent.keyDown(
      screen.getByRole('dialog', { name: 'Move to another board' }),
      { key: 'Escape' }
    )
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Move to another board' })
      ).toBeNull()
    })
    const loads = boardsApi.getBoard.mock.calls.length
    fail()

    await waitFor(() => {
      expect(boardsApi.getBoard.mock.calls.length).toBe(loads + 1)
    })
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(boardsApi.getBoard.mock.calls.length).toBe(loads + 1)
  })
})
