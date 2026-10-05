import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'
import { formatDay, localToday } from '@/ui/boards/dueLabel'

function designBoard(overrides: Parameters<typeof aBoard>[0] = {}) {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES', ...overrides })
  const [todo, doing] = board.sections
  board.tasks = [
    aTask(todo ?? null, { key: 'DES-1', title: 'Logo', dueDate: localToday() }),
    aTask(doing ?? null, { key: 'DES-2', title: 'Palette' })
  ]
  return board
}

const layouts = () => within(screen.getByRole('group', { name: 'Layout' }))

describe('board layouts', () => {
  it('switches to a list of sections, and keeps my pick', async () => {
    const board = designBoard()
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    await screen.findByRole('heading', { level: 1, name: 'Design' })
    fireEvent.click(layouts().getByRole('button', { name: 'List' }))

    expect(
      await screen.findByRole('list', { name: 'In progress' })
    ).toHaveTextContent('Palette')
    expect(layouts().getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(boardsApi.setLayout).toHaveBeenCalledWith(board.id, 'list')
  })

  it('places dated tasks on a month calendar, undated ones aside', async () => {
    const board = designBoard({ layout: 'calendar', defaultLayout: 'calendar' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const today = await screen.findByRole('region', {
      name: formatDay(localToday(), 'en')
    })
    expect(within(today).getByText('Logo')).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: 'No date' })).getByText(
        'Palette'
      )
    ).toBeVisible()
  })

  it('lets an admin make the current layout the board default', async () => {
    const board = designBoard()
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    await screen.findByRole('heading', { level: 1, name: 'Design' })
    expect(
      screen.queryByRole('button', { name: 'Use as default' })
    ).not.toBeInTheDocument()
    fireEvent.click(layouts().getByRole('button', { name: 'Calendar' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Use as default' })
    )

    await screen.findByRole('region', { name: 'No date' })
    expect(boardsApi.setDefaultLayout).toHaveBeenCalledWith(
      board.id,
      'calendar'
    )
  })
})
