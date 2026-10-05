import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'
import { localToday, localZone } from '@/ui/boards/dueLabel'

const day = (offset: number) => {
  const date = new Date(`${localToday()}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function boards() {
  const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
  design.tasks = [
    aTask(null, { key: 'DES-1', title: 'Logo', dueDate: day(0) }),
    aTask(null, { key: 'DES-2', title: 'Poster', dueDate: day(-2) }),
    aTask(null, { key: 'DES-3', title: 'Flyer', dueDate: day(3) })
  ]
  return { design, boardsApi: fakeBoardsApi([design]) }
}

describe('AgendaScreen', () => {
  it('shows overdue and today’s tasks, each linked to its board', async () => {
    const { design, boardsApi } = boards()
    renderRoute('/today', { boardsApi })

    const overdue = within(
      await screen.findByRole('region', { name: 'Overdue' })
    )
    expect(overdue.getByRole('link', { name: /Poster/ })).toHaveAttribute(
      'href',
      `/boards/${design.id}`
    )
    const today = within(screen.getByRole('region', { name: 'Today' }))
    expect(today.getByText('Logo')).toBeVisible()
    expect(screen.queryByText('Flyer')).not.toBeInTheDocument()
    expect(boardsApi.agenda).toHaveBeenCalledWith(localZone(), 1)
  })

  it('shows the next seven days on Upcoming', async () => {
    const { boardsApi } = boards()
    renderRoute('/today', { boardsApi })

    fireEvent.click(
      within(await screen.findByRole('navigation')).getByRole('link', {
        name: 'Upcoming'
      })
    )

    expect(await screen.findByText('Flyer')).toBeVisible()
    expect(boardsApi.agenda).toHaveBeenLastCalledWith(localZone(), 7)
  })

  it('says when there is nothing to do', async () => {
    renderRoute('/today', { boardsApi: fakeBoardsApi() })

    expect(await screen.findByText('Nothing due.')).toBeVisible()
  })
})
