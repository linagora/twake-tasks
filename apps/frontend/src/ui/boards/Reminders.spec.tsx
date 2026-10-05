import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'
import { localZone } from '@/ui/boards/dueLabel'

async function openLogo(dueDate: string | null) {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
  const logo = aTask(board.sections[0] ?? null, {
    key: 'DES-1',
    title: 'Logo',
    dueDate
  })
  board.tasks = [logo]
  const boardsApi = fakeBoardsApi([board])
  renderRoute(`/boards/${board.id}`, { boardsApi })
  fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
  const panel = within(
    await screen.findByRole('dialog', { name: 'DES-1 Logo' })
  )
  return {
    board,
    logo,
    boardsApi,
    reminders: within(panel.getByRole('region', { name: 'Reminders' }))
  }
}

describe('Reminders', () => {
  it('reminds an hour before the due date, in the local zone', async () => {
    const { board, logo, boardsApi, reminders } = await openLogo('2026-11-02')

    fireEvent.change(reminders.getByRole('combobox', { name: 'Remind me' }), {
      target: { value: '60' }
    })
    fireEvent.click(reminders.getByRole('button', { name: 'Add reminder' }))

    expect(await reminders.findByText('1 hour before')).toBeVisible()
    expect(boardsApi.addReminder).toHaveBeenCalledWith(board.id, logo.id, {
      beforeMinutes: 60,
      zone: localZone()
    })
  })

  it('reminds at a set time, and only then without a due date', async () => {
    const { board, logo, boardsApi, reminders } = await openLogo(null)

    expect(
      reminders.queryByRole('combobox', { name: 'Remind me' })
    ).not.toBeInTheDocument()
    fireEvent.change(reminders.getByLabelText('At'), {
      target: { value: '2026-11-02T08:00' }
    })
    fireEvent.click(reminders.getByRole('button', { name: 'Add reminder' }))

    await reminders.findByRole('listitem')
    expect(boardsApi.addReminder).toHaveBeenCalledWith(board.id, logo.id, {
      at: new Date('2026-11-02T08:00').toISOString()
    })
  })

  it('deletes a reminder', async () => {
    const { reminders } = await openLogo('2026-11-02')
    fireEvent.click(reminders.getByRole('button', { name: 'Add reminder' }))
    const item = await reminders.findByRole('listitem')

    fireEvent.click(
      within(item).getByRole('button', { name: 'Delete reminder' })
    )

    expect(await reminders.findByText('No reminders.')).toBeVisible()
  })
})
