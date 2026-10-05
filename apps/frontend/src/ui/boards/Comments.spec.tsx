import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

function logoBoard(role: 'admin' | 'viewer' = 'admin') {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES', role })
  const logo = aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
  board.tasks = [logo]
  const boardsApi = fakeBoardsApi([board])
  boardsApi.comments.set(logo.id, [
    {
      id: 'c1',
      author: { userId: 'bob', email: 'bob@example.com' },
      body: 'Which palette?',
      createdAt: '2026-10-05T09:00:00Z'
    }
  ])
  return { board, logo, boardsApi }
}

async function openLogo() {
  fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
  return within(await screen.findByRole('dialog', { name: 'DES-1 Logo' }))
}

describe('Comments', () => {
  it('shows who said what on a task', async () => {
    const { board, boardsApi } = logoBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const comment = within(
      await (
        await openLogo()
      ).findByRole('article', { name: 'bob@example.com' })
    )

    expect(comment.getByText('Which palette?')).toBeInTheDocument()
  })

  it('lets a viewer add a comment', async () => {
    const { board, logo, boardsApi } = logoBoard('viewer')
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    fireEvent.change(panel.getByRole('textbox', { name: 'Comment' }), {
      target: { value: 'The new one.' }
    })
    fireEvent.click(panel.getByRole('button', { name: 'Send' }))

    expect(await panel.findByText('The new one.')).toBeInTheDocument()
    expect(panel.getByRole('textbox', { name: 'Comment' })).toHaveValue('')
    expect(boardsApi.addComment).toHaveBeenCalledWith(
      board.id,
      logo.id,
      'The new one.'
    )
  })
})
