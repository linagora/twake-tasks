import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'
import { typeRichText } from '@/testing/richText'

function logoBoard(role: 'admin' | 'viewer' = 'admin') {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES', role })
  const logo = aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
  board.tasks = [logo]
  const boardsApi = fakeBoardsApi([board])
  boardsApi.comments.set(logo.id, [
    {
      id: 'c1',
      author: { userId: 'bob', email: 'bob@example.com', name: 'Bob Durand' },
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
      await (await openLogo()).findByRole('article', { name: 'Bob Durand' })
    )

    expect(comment.getByText('Which palette?')).toBeInTheDocument()
  })

  it('lets a viewer add a comment', async () => {
    const { board, logo, boardsApi } = logoBoard('viewer')
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const panel = await openLogo()
    await typeRichText(
      await panel.findByRole('textbox', { name: 'Comment' }),
      'The new one.'
    )
    fireEvent.click(panel.getByRole('button', { name: 'Send' }))

    expect(
      await panel.findByRole('article', { name: 'me@example.com' })
    ).toHaveTextContent('The new one.')
    await waitFor(() => {
      expect(panel.getByRole('textbox', { name: 'Comment' })).toHaveTextContent(
        ''
      )
    })
    expect(boardsApi.addComment).toHaveBeenCalledWith(
      board.id,
      logo.id,
      'The new one.'
    )
  })

  it('shows formatting written in a comment', async () => {
    const { board, logo, boardsApi } = logoBoard()
    boardsApi.comments.set(logo.id, [
      {
        id: 'c2',
        author: { userId: 'bob', email: 'bob@example.com', name: null },
        body: 'Use the **new** one:\n\n- [x] logo\n- [ ] icons',
        createdAt: '2026-10-05T09:00:00Z'
      }
    ])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const comment = within(
      await (
        await openLogo()
      ).findByRole('article', { name: 'bob@example.com' })
    )

    expect(await comment.findByText('new')).toContainHTML('new')
    expect(comment.getByText('new').tagName).toBe('STRONG')
    expect(comment.getAllByRole('checkbox')).toHaveLength(2)
  })
})
