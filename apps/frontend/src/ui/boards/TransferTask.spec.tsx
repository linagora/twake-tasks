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
    const form = within(
      await panel.findByRole('form', { name: 'Move to another board' })
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
})
