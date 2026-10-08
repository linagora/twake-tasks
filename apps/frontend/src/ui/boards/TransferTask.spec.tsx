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
})
