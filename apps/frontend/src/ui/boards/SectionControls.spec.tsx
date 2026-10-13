import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

function helpOf(select: HTMLElement): HTMLElement {
  const id = select.getAttribute('aria-describedby')
  const help = id ? document.getElementById(id) : null
  if (!help) throw new Error('the field has no help text')
  return help
}

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

describe('section type help', () => {
  it('labels the field and explains the default type', async () => {
    const dialog = await openNewSection()
    const select = dialog.getByRole('combobox', { name: 'Section type' })

    expect(select).toHaveValue('unstarted')
    expect(helpOf(select)).toHaveTextContent(
      'Tasks are not marked done or canceled. Tasks moved here from a Done or Canceled section are reopened.'
    )
  })

  it('links the help text to the field', async () => {
    const dialog = await openNewSection()
    const select = dialog.getByRole('combobox', { name: 'Section type' })
    const help = helpOf(select)

    expect(select).toHaveAccessibleDescription(help.textContent)
    expect(help.id).not.toBe('')
  })

  it('changes the help text with the selected type', async () => {
    const dialog = await openNewSection()
    const select = dialog.getByRole('combobox', { name: 'Section type' })
    const help = helpOf(select)

    fireEvent.change(select, { target: { value: 'completed' } })
    expect(help).toHaveTextContent(
      'Tasks moved here within this board are marked done. A recurring task with a due date stays open and moves to its next due date.'
    )
    expect(select).toHaveAccessibleDescription(/stays open/)

    fireEvent.change(select, { target: { value: 'canceled' } })
    expect(help).toHaveTextContent('Tasks moved here are marked canceled.')

    fireEvent.change(select, { target: { value: 'started' } })
    expect(help).toHaveTextContent(
      'Tasks are not marked done or canceled. Tasks moved here from a Done or Canceled section are reopened.'
    )
  })

  it('warns when editing only once the type actually changes', async () => {
    const board = aBoard({ name: 'Design' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Options for To do' })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Edit section' }))
    const select = dialog.getByRole('combobox', { name: 'Section type' })
    const note = /will be marked done, marked canceled or reopened/

    expect(helpOf(select)).not.toHaveTextContent(note)

    fireEvent.change(select, { target: { value: 'completed' } })
    expect(helpOf(select)).toHaveTextContent(note)
    expect(helpOf(select)).toHaveTextContent('stays open')

    fireEvent.change(select, { target: { value: 'unstarted' } })
    expect(helpOf(select)).not.toHaveTextContent(note)
  })

  it('announces the help politely', async () => {
    const dialog = await openNewSection()
    const select = dialog.getByRole('combobox', { name: 'Section type' })

    expect(helpOf(select)).toHaveAttribute('aria-live', 'polite')
  })
})
