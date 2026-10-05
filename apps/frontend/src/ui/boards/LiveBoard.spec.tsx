import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

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
})
