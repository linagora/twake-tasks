import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'
import { followZone, localZone } from '@/ui/boards/dueLabel'

afterEach(() => {
  followZone(null)
})

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
  const reminders = within(panel.getByRole('region', { name: 'Reminders' }))
  return {
    board,
    logo,
    boardsApi,
    reminders,
    openEditor: async () => {
      const add = reminders.getByRole('button', { name: 'Add reminder' })
      add.focus()
      fireEvent.click(add)
      return within(await screen.findByRole('dialog', { name: 'Add reminder' }))
    }
  }
}

describe('Reminders', () => {
  it('keeps the reminder form closed until asked for', async () => {
    const { reminders, openEditor } = await openLogo('2026-11-02')

    expect(reminders.getByText('None')).toBeVisible()
    expect(screen.queryByRole('dialog', { name: 'Add reminder' })).toBeNull()

    const editor = await openEditor()
    fireEvent.click(editor.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add reminder' })).toBeNull()
    })
    expect(
      reminders.getByRole('button', { name: 'Add reminder' })
    ).toHaveFocus()
  })

  it('reminds an hour before the due date, in the local zone', async () => {
    const { board, logo, boardsApi, reminders, openEditor } =
      await openLogo('2026-11-02')

    const editor = await openEditor()
    fireEvent.change(editor.getByRole('combobox', { name: 'Remind me' }), {
      target: { value: '60' }
    })
    fireEvent.click(editor.getByRole('button', { name: 'Save reminder' }))

    expect(await reminders.findByRole('listitem')).toHaveTextContent(
      '1 hour before'
    )
    expect(reminders.queryByText('None')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add reminder' })).toBeNull()
    })
    expect(boardsApi.addReminder).toHaveBeenCalledWith(board.id, logo.id, {
      beforeMinutes: 60,
      zone: localZone()
    })
  })

  it('reminds at a set time, and only then without a due date', async () => {
    const { board, logo, boardsApi, reminders, openEditor } =
      await openLogo(null)

    const editor = await openEditor()
    expect(
      editor.queryByRole('combobox', { name: 'Remind me' })
    ).not.toBeInTheDocument()
    fireEvent.change(editor.getByDisplayValue(''), {
      target: { value: '11/02/2026 08:00' }
    })
    fireEvent.click(editor.getByRole('button', { name: 'Save reminder' }))

    await reminders.findByRole('listitem')
    expect(boardsApi.addReminder).toHaveBeenCalledWith(board.id, logo.id, {
      at: new Date('2026-11-02T08:00').toISOString()
    })
  })

  it("reminds at a set time of the person's time zone", async () => {
    followZone('Asia/Tokyo')
    const { board, logo, boardsApi, reminders, openEditor } =
      await openLogo(null)

    const editor = await openEditor()
    fireEvent.change(editor.getByDisplayValue(''), {
      target: { value: '11/02/2026 08:00' }
    })
    fireEvent.click(editor.getByRole('button', { name: 'Save reminder' }))

    expect(await reminders.findByRole('listitem')).toHaveTextContent(
      'Nov 2, 2026, 8:00 AM'
    )
    expect(boardsApi.addReminder).toHaveBeenCalledWith(board.id, logo.id, {
      at: '2026-11-01T23:00:00.000Z'
    })
  })

  it('deletes a reminder', async () => {
    const { reminders, openEditor } = await openLogo('2026-11-02')
    const editor = await openEditor()
    fireEvent.click(editor.getByRole('button', { name: 'Save reminder' }))
    const item = await reminders.findByRole('listitem')

    fireEvent.click(
      within(item).getByRole('button', { name: 'Delete reminder' })
    )

    await waitFor(() => {
      expect(reminders.queryByRole('listitem')).toBeNull()
    })
  })
})
