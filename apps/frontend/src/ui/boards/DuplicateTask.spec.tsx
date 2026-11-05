import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/application/boards'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

function logoBoard() {
  const board = aBoard({ name: 'Design' })
  const logo = aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
  board.tasks = [logo]
  const boardsApi = fakeBoardsApi([board])
  renderRoute(`/boards/${board.id}`, { boardsApi })
  return { board, logo, boardsApi }
}

describe('duplicating a task', () => {
  it('copies a task from its card and opens the copy', async () => {
    const { board, logo, boardsApi } = logoBoard()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Options for DES-1' })
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))

    expect(
      await screen.findByRole('dialog', { name: 'DES-2 Copy of Logo' })
    ).toBeVisible()
    expect(boardsApi.duplicateTask).toHaveBeenCalledWith(
      board.id,
      logo.id,
      'Copy of Logo'
    )
    expect(
      await screen.findByRole('article', { name: 'DES-2 Copy of Logo' })
    ).toBeVisible()
  })

  it('copies the open task from its options', async () => {
    logoBoard()
    fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
    const panel = within(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    )

    fireEvent.click(panel.getByRole('button', { name: 'Task options' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))

    expect(
      await screen.findByRole('dialog', { name: 'DES-2 Copy of Logo' })
    ).toBeVisible()
  })

  it('says so when the copy fails', async () => {
    const { boardsApi } = logoBoard()
    boardsApi.duplicateTask.mockRejectedValueOnce(new ApiError(409, 'archived'))

    fireEvent.click(
      await screen.findByRole('button', { name: 'Options for DES-1' })
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The task could not be duplicated.'
    )
  })
})
