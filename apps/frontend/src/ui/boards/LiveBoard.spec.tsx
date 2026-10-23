import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/application/boards'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

describe('a board open in two places', () => {
  it('shows a change made elsewhere', async () => {
    const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })
    await screen.findByRole('heading', { name: 'Design' })

    act(() => {
      boardsApi.changeElsewhere(board.id, changed => {
        changed.tasks.push(
          aTask(changed.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
        )
      })
    })

    expect(
      await screen.findByRole('button', { name: 'Logo' })
    ).toBeInTheDocument()
  })

  it.each([
    ['the board', '', 'dialog', 'DES-1 Logo'],
    ['its trash', '/trash', 'heading', 'Trash']
  ] as const)(
    'leaves nothing of a board the viewer was removed from on %s',
    async (_, page, role, name) => {
      const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
      board.tasks = [
        aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
      ]
      const boardsApi = fakeBoardsApi([board])
      renderRoute(`/boards/${board.id}${page}?task=DES-1`, { boardsApi })
      await screen.findByRole(role, { name })

      boardsApi.getBoard.mockRejectedValue(new ApiError(404, 'not_found'))
      act(() => {
        boardsApi.changeElsewhere(board.id, () => undefined)
      })

      expect(
        await screen.findByText(
          "This board doesn't exist, or you can't open it."
        )
      ).toBeInTheDocument()
      expect(screen.queryByText('Design')).toBeNull()
      expect(screen.queryByText('Logo')).toBeNull()
      expect(screen.queryByRole('dialog')).toBeNull()
    }
  )
})
