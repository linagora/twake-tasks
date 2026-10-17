import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/application/boards'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const urgent = { id: 'urgent', name: 'Urgent', color: null }

function labeledBoard() {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES', labels: [urgent] })
  const logo = aTask(board.sections[0] ?? null, {
    key: 'DES-1',
    title: 'Logo',
    labels: [urgent]
  })
  board.tasks = [logo]
  return { board, logo, boardsApi: fakeBoardsApi([board]) }
}

async function openLabels() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Options for DES-1' })
  )
  fireEvent.click(screen.getByRole('menuitem', { name: 'Labels' }))
  return within(await screen.findByRole('dialog', { name: 'Labels of DES-1' }))
}

const search = (
  picker: Awaited<ReturnType<typeof openLabels>>,
  text: string
) => {
  fireEvent.change(picker.getByRole('textbox', { name: 'Search labels' }), {
    target: { value: text }
  })
}

const logoCard = async () =>
  within(
    await screen.findByRole('article', { name: 'DES-1 Logo', hidden: true })
  )

// The swatches are in the dialog, under the name.
function pickColor(name: string) {
  const colors = within(screen.getByRole('radiogroup', { name: 'Color' }))
  fireEvent.click(colors.getByRole('radio', { name }))
}

describe('Labels', () => {
  it('highlights the searched part of each label', async () => {
    const { board, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })
    const picker = await openLabels()

    search(picker, 'gen')

    const option = picker.getByRole('menuitemcheckbox', { name: 'Urgent' })
    expect(
      [...option.querySelectorAll('mark')].map(mark => mark.textContent)
    ).toEqual(['gen'])
  })

  it('shows a task’s labels on its card', async () => {
    const { board, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    expect((await logoCard()).getByText('Urgent')).toBeInTheDocument()
  })

  it('takes a label off the task in one click', async () => {
    const { board, logo, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openLabels()
    const urgentItem = picker.getByRole('menuitemcheckbox', { name: 'Urgent' })
    expect(urgentItem).toBeChecked()
    fireEvent.click(urgentItem)

    await waitFor(async () => {
      expect((await logoCard()).queryByText('Urgent')).not.toBeInTheDocument()
    })
    expect(boardsApi.setLabels).toHaveBeenCalledWith(board.id, logo.id, [])
    expect(
      screen.getByRole('dialog', { name: 'Labels of DES-1' })
    ).toBeVisible()
  })

  it('creates a label from the search text and puts it on the task', async () => {
    const { board, logo, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openLabels()
    search(picker, 'Later')
    expect(
      picker.queryByRole('menuitemcheckbox', { name: 'Urgent' })
    ).not.toBeInTheDocument()
    fireEvent.click(picker.getByRole('menuitem', { name: 'Create “Later”' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'New label' })
    )
    expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue('Later')
    pickColor('Purple')
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'New label' })).getByRole(
        'button',
        { name: 'Create' }
      )
    )

    expect(await (await logoCard()).findByText('Later')).toBeInTheDocument()
    expect((await logoCard()).getByText('Urgent')).toBeInTheDocument()
    expect(boardsApi.createLabel).toHaveBeenCalledWith(board.id, {
      name: 'Later',
      color: '#7E57E3'
    })
    expect(boardsApi.setLabels).toHaveBeenCalledWith(board.id, logo.id, [
      urgent.id,
      expect.any(String)
    ])
    expect(
      screen.queryByRole('dialog', { name: 'New label' })
    ).not.toBeInTheDocument()
  })

  it('starts a new label with the color the board uses the least', async () => {
    const { board, boardsApi } = labeledBoard()
    board.labels = [
      { id: 'urgent', name: 'Urgent', color: '#273891' },
      { id: 'later', name: 'Later', color: null }
    ]
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openLabels()
    search(picker, 'Soon')
    fireEvent.click(picker.getByRole('menuitem', { name: 'Create “Soon”' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'New label' })
    )
    expect(dialog.getByRole('radio', { name: 'Purple' })).toBeChecked()
    fireEvent.click(dialog.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(boardsApi.createLabel).toHaveBeenCalledWith(board.id, {
        name: 'Soon',
        color: '#7E57E3'
      })
    })
  })

  it('creates a label without a color when none is chosen', async () => {
    const { board, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openLabels()
    search(picker, 'Later')
    fireEvent.click(picker.getByRole('menuitem', { name: 'Create “Later”' }))
    await screen.findByRole('dialog', { name: 'New label' })
    pickColor('No color')
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'New label' })).getByRole(
        'button',
        { name: 'Create' }
      )
    )

    await waitFor(() => {
      expect(boardsApi.createLabel).toHaveBeenCalledWith(board.id, {
        name: 'Later',
        color: null
      })
    })
  })

  it('offers to create a label before anything is typed', async () => {
    const { board, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openLabels()
    fireEvent.click(picker.getByRole('menuitem', { name: 'Create a label' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'New label' })
    )
    expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue('')
    expect(dialog.getByRole('button', { name: 'Create' })).toBeDisabled()
  })

  it('renames and recolours a label', async () => {
    const { board, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openLabels()
    fireEvent.click(picker.getByRole('button', { name: 'Edit Urgent' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Edit label' })
    )
    fireEvent.change(dialog.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Blocker' }
    })
    pickColor('Red')
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Edit label' })).getByRole(
        'button',
        { name: 'Save' }
      )
    )

    expect(await (await logoCard()).findByText('Blocker')).toBeInTheDocument()
    expect(boardsApi.editLabel).toHaveBeenCalledWith(board.id, urgent.id, {
      name: 'Blocker',
      color: '#E0465C'
    })
    expect(boardsApi.setLabels).not.toHaveBeenCalled()
  })

  it('puts the cursor in the search field', async () => {
    const { board, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openLabels()

    await waitFor(() => {
      expect(
        picker.getByRole('textbox', { name: 'Search labels' })
      ).toHaveFocus()
    })
  })

  it('offers to create only a name no label has', async () => {
    const { board, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openLabels()
    search(picker, 'urgent')

    expect(
      picker.getByRole('menuitemcheckbox', { name: 'Urgent' })
    ).toBeInTheDocument()
    expect(
      picker.queryByRole('menuitem', { name: /^Create “/ })
    ).not.toBeInTheDocument()
    expect(
      picker.getByRole('menuitem', { name: 'Create a label' })
    ).toBeInTheDocument()
  })

  it('finds a label by a name with invisible characters', async () => {
    const { board, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openLabels()
    search(picker, 'Ur\u{2060}gent\u{200B}')

    expect(
      picker.getByRole('menuitemcheckbox', { name: 'Urgent' })
    ).toBeInTheDocument()
    expect(
      picker.queryByRole('menuitem', { name: /^Create “/ })
    ).not.toBeInTheDocument()
  })

  it('says when the name is taken', async () => {
    const { board, boardsApi } = labeledBoard()
    boardsApi.createLabel.mockRejectedValue(new ApiError(409, 'label_taken'))
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const picker = await openLabels()
    search(picker, 'Soon')
    fireEvent.click(picker.getByRole('menuitem', { name: 'Create “Soon”' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'New label' })
    )
    fireEvent.click(dialog.getByRole('button', { name: 'Create' }))

    expect(
      await dialog.findByText('A label named Soon already exists.')
    ).toBeInTheDocument()
  })
})
