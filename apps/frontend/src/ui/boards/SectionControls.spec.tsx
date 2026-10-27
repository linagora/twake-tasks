import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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
  it('has the caret in a new section', async () => {
    const dialog = await openNewSection()

    expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveFocus()
  })

  it('has the name selected when editing a section', async () => {
    const board = aBoard({ name: 'Design' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Options for To do' })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    const name = within(
      screen.getByRole('dialog', { name: 'Edit section' })
    ).getByRole<HTMLInputElement>('textbox', { name: 'Name' })

    expect(name).toHaveFocus()
    expect([name.selectionStart, name.selectionEnd]).toEqual([0, 5])
  })

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

describe('done section', () => {
  it('counts the tasks of a section as done, then as open again', async () => {
    const board = aBoard({ name: 'Design' })
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })
    const [todo, , doneSection] = board.sections

    fireEvent.click(
      await screen.findByRole('button', { name: 'Options for To do' })
    )
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Count its tasks as done' })
    )
    await waitFor(() => {
      expect(boardsApi.editSection).toHaveBeenCalledWith(board.id, todo?.id, {
        category: 'completed'
      })
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Options for Done' })
    )
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Count its tasks as open' })
    )
    await waitFor(() => {
      expect(boardsApi.editSection).toHaveBeenCalledWith(
        board.id,
        doneSection?.id,
        { category: 'unstarted' }
      )
    })
  })
})
