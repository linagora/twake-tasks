import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

async function openQuickAdd() {
  const inbox = aBoard({ name: 'Inbox', keyPrefix: 'INB', inbox: true })
  const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
  const boardsApi = fakeBoardsApi([inbox, design])
  renderRoute(`/boards/${design.id}`, { boardsApi })
  fireEvent.click(
    within(await screen.findByRole('banner')).getByRole('button', {
      name: 'Quick add'
    })
  )
  const dialog = within(
    await screen.findByRole('dialog', { name: 'Quick add' })
  )
  const add = (line: string) => {
    fireEvent.change(dialog.getByRole('textbox', { name: 'Task' }), {
      target: { value: line }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Add' }))
  }
  return { dialog, add, design }
}

describe('QuickAdd', () => {
  it('adds a task from one line and shows it on its board', async () => {
    const { dialog, add } = await openQuickAdd()
    expect(dialog.getByRole('textbox', { name: 'Task' })).toHaveFocus()

    add('Logo tomorrow p1 #Design')

    expect(await dialog.findByText('DES-1 added.')).toBeVisible()
    expect(dialog.getByRole('textbox', { name: 'Task' })).toHaveValue('')
    fireEvent.click(dialog.getByRole('button', { name: 'Close' }))
    expect(
      await screen.findByRole('button', { name: 'Logo' })
    ).toBeInTheDocument()
  })

  it('names what it could not find', async () => {
    const { dialog, add, design } = await openQuickAdd()

    add('Logo #Marketing')

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'No board named Marketing.'
    )
    expect(design.tasks).toEqual([])
  })
})
