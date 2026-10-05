import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const urgent = { id: 'urgent', name: 'Urgent' }

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
  return within(screen.getByRole('dialog', { name: 'Labels of DES-1' }))
}

const logoCard = async () =>
  within(await screen.findByRole('article', { name: 'DES-1 Logo' }))

describe('Labels', () => {
  it('shows a task’s labels on its card', async () => {
    const { board, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    expect((await logoCard()).getByText('Urgent')).toBeInTheDocument()
  })

  it('creates a label and puts it on the task', async () => {
    const { board, logo, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const dialog = await openLabels()
    fireEvent.change(dialog.getByRole('textbox', { name: 'New label' }), {
      target: { value: 'Later' }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Create' }))
    expect(await dialog.findByRole('checkbox', { name: 'Later' })).toBeChecked()
    fireEvent.click(dialog.getByRole('checkbox', { name: 'Urgent' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))

    expect(await (await logoCard()).findByText('Later')).toBeInTheDocument()
    expect((await logoCard()).queryByText('Urgent')).not.toBeInTheDocument()
    expect(boardsApi.createLabel).toHaveBeenCalledWith(board.id, 'Later')
    expect(boardsApi.setLabels).toHaveBeenCalledWith(board.id, logo.id, [
      expect.any(String)
    ])
  })

  it('says when the name is taken', async () => {
    const { board, boardsApi } = labeledBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const dialog = await openLabels()
    fireEvent.change(dialog.getByRole('textbox', { name: 'New label' }), {
      target: { value: 'Urgent' }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Create' }))

    expect(
      await dialog.findByText('A label named Urgent already exists.')
    ).toBeInTheDocument()
  })
})
