import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

function logoBoard() {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
  const logo = aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
  board.tasks = [logo]
  return { board, logo, boardsApi: fakeBoardsApi([board]) }
}

const change = (field: HTMLElement, value: string) => {
  fireEvent.change(field, { target: { value } })
}

describe('Dates', () => {
  it('says when a task has no dates', async () => {
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
    const panel = within(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    )

    expect(
      panel.getByRole('button', { name: 'Edit dates' }).closest('dd')
    ).toHaveTextContent('None')
  })

  it('sets a due date and time, a deadline and a duration', async () => {
    const { board, logo, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
    const panel = within(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    )
    fireEvent.click(panel.getByRole('button', { name: 'Edit dates' }))
    change(panel.getByLabelText('Due date'), '2026-11-02')
    change(panel.getByLabelText('Time'), '09:30')
    fireEvent.click(panel.getByRole('checkbox', { name: /Keep this time in/ }))
    change(panel.getByLabelText('Deadline'), '2026-11-06')
    change(panel.getByRole('spinbutton', { name: 'Duration' }), '90')
    fireEvent.click(panel.getByRole('button', { name: 'Save dates' }))

    expect(await panel.findByText(/Due Nov 2, 2026, 09:30/)).toBeVisible()
    expect(boardsApi.editTask).toHaveBeenCalledWith(board.id, logo.id, {
      dueDate: '2026-11-02',
      dueTime: '09:30',
      dueZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      deadline: '2026-11-06',
      duration: { amount: 90, unit: 'minutes' },
      recurrence: null
    })
  })

  it('repeats a task from its completion date', async () => {
    const { board, logo, boardsApi } = logoBoard()
    Object.assign(logo, { dueDate: '2026-11-02' })
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
    const panel = within(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    )
    fireEvent.click(panel.getByRole('button', { name: 'Edit dates' }))
    change(panel.getByRole('spinbutton', { name: 'Repeat every' }), '2')
    fireEvent.click(
      panel.getByRole('checkbox', { name: 'From the completion date' })
    )
    fireEvent.click(panel.getByRole('button', { name: 'Save dates' }))

    expect(
      await panel.findByText('Every 2 weeks after completion')
    ).toBeVisible()
    expect(boardsApi.editTask).toHaveBeenCalledWith(
      board.id,
      logo.id,
      expect.objectContaining({
        recurrence: { every: 2, unit: 'weeks', fromCompletion: true }
      })
    )
  })

  it('shows the due time on the card', async () => {
    const { board, boardsApi } = logoBoard()
    Object.assign(board.tasks[0] ?? {}, {
      dueDate: '2026-11-02',
      dueTime: '09:30'
    })
    renderRoute(`/boards/${board.id}`, { boardsApi })

    expect(
      within(
        await screen.findByRole('article', { name: 'DES-1 Logo' })
      ).getByLabelText(/due Nov 2, 2026, 09:30$/i)
    ).toBeInTheDocument()
  })
})
