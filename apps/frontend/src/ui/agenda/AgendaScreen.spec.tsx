import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { findEmptyState } from '@/testing/emptyState'
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
  it('shows overdue and today’s tasks, each opening in its board', async () => {
    const { design, boardsApi } = boards()
    renderRoute('/today', { boardsApi })

    const overdue = within(
      await screen.findByRole('region', { name: 'Overdue' })
    )
    expect(overdue.getByRole('link', { name: /Poster/ })).toHaveAttribute(
      'href',
      `/boards/${design.id}?task=DES-2`
    )
    const today = within(screen.getByRole('region', { name: 'Today' }))
    expect(today.getByText('Logo')).toBeVisible()
    expect(screen.queryByText('Flyer')).not.toBeInTheDocument()
    expect(boardsApi.agenda).toHaveBeenCalledWith(localZone(), 1)
  })

  it('shows the key, board, priority, assignees and labels of each task', async () => {
    const { design, boardsApi } = boards()
    design.tasks[0] = aTask(null, {
      key: 'DES-1',
      title: 'Logo',
      dueDate: day(0),
      priority: 1,
      assignees: [{ userId: 'u1', email: 'ana@example.com' }],
      labels: [{ id: 'l1', name: 'client' }]
    })
    renderRoute('/today', { boardsApi })

    const row = within(await screen.findByRole('listitem', { name: /Logo/ }))

    expect(row.getByText('DES-1 · Design')).toBeVisible()
    expect(row.getByRole('img', { name: 'Priority 1' })).toBeVisible()
    expect(
      row.getByRole('img', { name: 'Assigned to ana@example.com' })
    ).toBeVisible()
    expect(row.getByText('client')).toBeVisible()
  })

  it('completes a task from its row', async () => {
    const { design, boardsApi } = boards()
    renderRoute('/today', { boardsApi })

    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Complete Logo' })
    )

    await waitFor(() => {
      expect(boardsApi.completeTask).toHaveBeenCalledWith(
        design.id,
        design.tasks[0]?.id,
        'completed'
      )
    })
    await waitFor(() => {
      expect(screen.queryByText('Logo')).not.toBeInTheDocument()
    })
  })

  it('completes a task in a section by moving it to the done one', async () => {
    const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
    const [todo, , done] = design.sections
    design.tasks = [
      aTask(todo ?? null, { key: 'DES-1', title: 'Logo', dueDate: day(0) })
    ]
    const boardsApi = fakeBoardsApi([design])
    renderRoute('/today', { boardsApi })

    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Complete Logo' })
    )

    await waitFor(() => {
      expect(boardsApi.moveTask).toHaveBeenCalledWith(
        design.id,
        design.tasks[0]?.id,
        { sectionId: done?.id }
      )
    })
  })

  it('leaves the day out of rows already grouped by day', async () => {
    const { boardsApi } = boards()
    renderRoute('/upcoming', { boardsApi })

    const flyer = within(await screen.findByRole('listitem', { name: /Flyer/ }))
    expect(flyer.queryByLabelText(/due /i)).toBeNull()
    expect(
      within(screen.getByRole('listitem', { name: /Poster/ })).getByLabelText(
        /^Overdue, due /
      )
    ).toBeVisible()
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

  it('lists the tasks assigned to me, undated ones last', async () => {
    const { design, boardsApi } = boards()
    const me = { userId: 'me', email: 'me@example.com' }
    design.tasks.push(
      aTask(null, { key: 'DES-4', title: 'Brief', assignees: [me] }),
      aTask(null, {
        key: 'DES-5',
        title: 'Mockups',
        dueDate: day(5),
        assignees: [me]
      })
    )
    renderRoute('/mine', { boardsApi })

    expect(
      within(await screen.findByRole('region', { name: 'No date' })).getByText(
        'Brief'
      )
    ).toBeVisible()
    expect(screen.getByText('Mockups')).toBeVisible()
    expect(screen.queryByText('Logo')).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('navigation')).getByRole('link', {
        name: 'My tasks'
      })
    ).toHaveAttribute('href', '/mine')
  })

  it('says when there is nothing to do', async () => {
    renderRoute('/today', { boardsApi: fakeBoardsApi() })

    expect(await findEmptyState('Nothing due')).toHaveTextContent(
      'You are all caught up.'
    )
  })

  it('says when nothing is assigned to me', async () => {
    renderRoute('/mine', { boardsApi: fakeBoardsApi() })

    expect(await findEmptyState('Nothing assigned to you')).toHaveTextContent(
      'Tasks assigned to you on any board show up here.'
    )
  })

  it('shows placeholders while the tasks load', async () => {
    const boardsApi = fakeBoardsApi()
    boardsApi.agenda.mockReturnValue(new Promise(() => undefined))
    renderRoute('/today', { boardsApi })

    expect(
      await screen.findByRole('progressbar', { name: 'Loading' })
    ).toBeInTheDocument()
  })
})
