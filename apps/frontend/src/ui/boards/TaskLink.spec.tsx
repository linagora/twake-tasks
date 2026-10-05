import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

describe('a link to a task', () => {
  it('opens the board with that task shown', async () => {
    const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
    const section = board.sections[0] ?? null
    board.tasks = [
      aTask(section, { key: 'DES-1', title: 'Logo' }),
      aTask(section, { key: 'DES-2', title: 'Poster' })
    ]

    renderRoute(`/boards/${board.id}?task=DES-2`, {
      boardsApi: fakeBoardsApi([board])
    })

    expect(
      await screen.findByRole('dialog', { name: 'DES-2 Poster' })
    ).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })
})
