import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/application/boards'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

function logoBoard() {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
  const logo = aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
  board.tasks = [logo]
  const boardsApi = fakeBoardsApi([board])
  boardsApi.descriptions.set(logo.id, {
    markdown: 'Use the **new** palette.',
    version: 3
  })
  return { board, logo, boardsApi }
}

async function openLogo() {
  fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
  return within(await screen.findByRole('dialog', { name: 'DES-1 Logo' }))
}

describe('TaskPanel', () => {
  it('shows the description as formatted text', async () => {
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()

    expect(await panel.findByText('new', { selector: 'strong' })).toBeVisible()
  })

  it('edits the description from the version it started from', async () => {
    const { board, logo, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    fireEvent.click(
      await panel.findByRole('button', { name: 'Edit description' })
    )
    fireEvent.change(panel.getByRole('textbox', { name: 'Description' }), {
      target: { value: '# Brief' }
    })
    fireEvent.click(panel.getByRole('button', { name: 'Save' }))

    expect(
      await panel.findByRole('heading', { name: 'Brief' })
    ).toBeInTheDocument()
    expect(boardsApi.setDescription).toHaveBeenCalledWith(board.id, logo.id, {
      markdown: '# Brief',
      version: 3
    })
  })

  it('keeps the draft when someone else changed the description', async () => {
    const { board, boardsApi } = logoBoard()
    boardsApi.setDescription.mockRejectedValueOnce(
      new ApiError(409, 'stale_version')
    )
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    fireEvent.click(
      await panel.findByRole('button', { name: 'Edit description' })
    )
    fireEvent.change(panel.getByRole('textbox', { name: 'Description' }), {
      target: { value: 'Mine' }
    })
    fireEvent.click(panel.getByRole('button', { name: 'Save' }))

    expect(
      await panel.findByText(
        'Someone else changed the description. Your text is kept: save again to replace theirs.'
      )
    ).toBeInTheDocument()
    expect(panel.getByRole('textbox', { name: 'Description' })).toHaveValue(
      'Mine'
    )
  })

  it('offers no edit to a viewer', async () => {
    const { board, boardsApi } = logoBoard()
    board.role = 'viewer'
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()

    expect(await panel.findByText('new')).toBeVisible()
    expect(
      panel.queryByRole('button', { name: 'Edit description' })
    ).not.toBeInTheDocument()
  })
})
