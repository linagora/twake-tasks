import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

async function openNewSection() {
  const board = aBoard({ name: 'Design' })
  renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })
  fireEvent.click(await screen.findByRole('button', { name: 'New section' }))
  return within(screen.getByRole('dialog', { name: 'New section' }))
}

describe('section name', () => {
  it('refuses a name already on the board, in any case, and clears on typing', async () => {
    const dialog = await openNewSection()
    const name = dialog.getByRole('textbox', { name: 'Name' })

    fireEvent.change(name, { target: { value: 'to do' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))

    expect(
      await dialog.findByText('A section named to do already exists.')
    ).toBeInTheDocument()
    expect(name).toBeInvalid()
    expect(dialog.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.change(name, { target: { value: 'Review' } })
    expect(
      dialog.queryByText('A section named to do already exists.')
    ).not.toBeInTheDocument()
  })
})
