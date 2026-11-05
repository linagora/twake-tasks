import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/application/boards'
import { addDays } from '@/application/reschedule'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'
import { localToday } from '@/ui/boards/dueLabel'

const bob = { userId: 'bob', email: 'bob@example.com', name: 'Bob Stone' }

function launchBoard() {
  const board = aBoard({
    name: 'Launch',
    layout: 'progress',
    defaultLayout: 'progress',
    members: [bob]
  })
  const [todo] = board.sections
  const yesterday = addDays(localToday(), -1)
  board.tasks = [
    aTask(todo ?? null, { title: 'Brief', dueDate: yesterday }),
    aTask(todo ?? null, {
      title: 'Press kit',
      dueDate: yesterday,
      assignees: [bob]
    }),
    aTask(todo ?? null, { title: 'Site', dueDate: yesterday }),
    aTask(todo ?? null, { title: 'Video', assignees: [bob] }),
    aTask(null, { title: 'Archive old posts' })
  ]
  return board
}

const tile = (name: RegExp) => screen.findByRole('button', { name })

describe('the progress layout', () => {
  it('is in the layout switch', async () => {
    const board = aBoard({ name: 'Launch' })
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const layouts = within(await screen.findByRole('group', { name: 'Layout' }))
    fireEvent.click(layouts.getByRole('button', { name: 'Progress' }))

    await waitFor(() => {
      expect(boardsApi.setLayout).toHaveBeenCalledWith(board.id, 'progress')
    })
    expect(
      await screen.findByText('Progress appears once the board has tasks.')
    ).toBeVisible()
    expect(screen.getByText('No tasks yet')).toBeVisible()
  })

  it('counts the open tasks, and opens the Kanban on the late ones', async () => {
    const board = launchBoard()
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    expect(await tile(/^Open: 5\./)).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^No assignee: 3\./ })
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Filter/ })).toBeNull()

    fireEvent.click(await tile(/^Overdue: 3\./))

    await waitFor(() => {
      expect(boardsApi.setLayout).toHaveBeenCalledWith(board.id, 'board')
    })
    const column = within(await screen.findByRole('region', { name: 'To do' }))
    expect(screen.getByRole('button', { name: /Overdue/ })).toBeVisible()
    expect(column.getByText('Brief')).toBeVisible()
    expect(column.getByText('Press kit')).toBeVisible()
    expect(column.getByText('Site')).toBeVisible()
    expect(column.queryByText('Video')).toBeNull()
  })

  it('shows the load of each person, and of nobody', async () => {
    const board = launchBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const people = within(
      await screen.findByRole('region', { name: 'Open tasks by person' })
    )
    expect(
      people.getByRole('button', {
        name: 'Bob Stone: 2 open, 1 overdue, 0 due this week. Show these tasks'
      })
    ).toBeVisible()
    fireEvent.click(
      people.getByRole('button', {
        name: 'Nobody: 3 open, 2 overdue, 0 due this week. Show these tasks'
      })
    )

    const column = within(await screen.findByRole('region', { name: 'To do' }))
    expect(column.getByText('Brief')).toBeVisible()
    expect(column.queryByText('Video')).toBeNull()
  })

  it('counts a task completed elsewhere, without a reload', async () => {
    const board = launchBoard()
    const boardsApi = fakeBoardsApi([board])
    boardsApi.pastCompletions.set(board.id, [
      { day: addDays(localToday(), -14), done: 2 }
    ])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    expect(await tile(/^Open: 5\./)).toBeVisible()
    expect(
      screen.getByText('Done in the last 7 days').parentElement
    ).toHaveTextContent('0')
    const weeks = within(
      await screen.findByRole('list', { name: 'Done per week' })
    )
    expect(weeks.getAllByRole('listitem')).toHaveLength(8)
    expect(
      weeks.getByRole('listitem', { name: /: 2 tasks done$/ })
    ).toBeVisible()

    act(() => {
      boardsApi.changeElsewhere(board.id, changed => {
        const task = changed.tasks.find(
          each => each.title === 'Archive old posts'
        )
        if (task) task.completedAt = `${localToday()}T12:00:00Z`
      })
    })

    expect(await tile(/^Open: 4\./)).toBeVisible()
    expect(
      await weeks.findByRole('listitem', { name: /: 1 task done$/ })
    ).toBeVisible()
    expect(
      screen.getByText('Done in the last 7 days').parentElement
    ).toHaveTextContent('1')
  })

  it('offers to retry when the weeks cannot be loaded', async () => {
    const board = launchBoard()
    const boardsApi = fakeBoardsApi([board])
    boardsApi.completions.mockRejectedValueOnce(new ApiError(403, 'forbidden'))
    renderRoute(`/boards/${board.id}`, { boardsApi })

    expect(
      await screen.findByText('The progress could not be loaded.')
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(
      await screen.findByRole('list', { name: 'Done per week' })
    ).toBeVisible()
  })
})
