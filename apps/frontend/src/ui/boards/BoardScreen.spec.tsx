import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/application/boards'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

function designBoard() {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
  const [todo, doing] = board.sections
  board.tasks = [
    aTask(todo ?? null, {
      key: 'DES-1',
      title: 'Logo',
      priority: 1,
      dueDate: '2026-10-12',
      assignees: ['alice.martin@example.com']
    }),
    aTask(doing ?? null, { key: 'DES-2', title: 'Palette' })
  ]
  return board
}

const column = (name: string) => screen.getByRole('region', { name })

describe('BoardScreen', () => {
  it('shows each section with its tasks', async () => {
    const board = designBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Design' })
    ).toBeInTheDocument()
    const todo = within(column('To do'))
    const logo = todo.getByRole('article', { name: 'DES-1 Logo' })
    expect(within(logo).getByText('P1')).toBeInTheDocument()
    expect(within(logo).getByText('Due Oct 12, 2026')).toBeInTheDocument()
    expect(
      within(logo).getByRole('img', {
        name: 'Assigned to alice.martin@example.com'
      })
    ).toBeInTheDocument()
    expect(
      within(column('In progress')).getByRole('article', {
        name: 'DES-2 Palette'
      })
    ).toBeInTheDocument()
    expect(within(column('Done')).queryAllByRole('article')).toHaveLength(0)
  })

  it('shows a No section column only when a task has no section', async () => {
    const board = designBoard()
    board.tasks.push(aTask(null, { key: 'DES-3', title: 'Loose' }))
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    expect(
      within(
        await screen.findByRole('region', { name: 'No section' })
      ).getByRole('article', { name: 'DES-3 Loose' })
    ).toBeInTheDocument()
  })

  it('adds a task to a section', async () => {
    const board = designBoard()
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    await screen.findByRole('heading', { level: 1, name: 'Design' })
    const done = within(column('Done'))
    fireEvent.click(done.getByRole('button', { name: 'Add a task to Done' }))
    fireEvent.change(done.getByRole('textbox', { name: 'Task title' }), {
      target: { value: 'Ship it' }
    })
    fireEvent.click(done.getByRole('button', { name: 'Add' }))

    expect(
      await within(column('Done')).findByRole('article', {
        name: 'DES-3 Ship it'
      })
    ).toBeInTheDocument()
  })

  it('moves a task to another section without dragging', async () => {
    const board = designBoard()
    const [logoTask] = board.tasks
    const boardsApi = fakeBoardsApi([board])
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const logo = await screen.findByRole('article', { name: 'DES-1 Logo' })
    fireEvent.click(within(logo).getByRole('button', { name: 'Move DES-1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Done' }))

    expect(
      await within(column('Done')).findByRole('article', {
        name: 'DES-1 Logo'
      })
    ).toBeInTheDocument()
    const sectionId = board.sections[2]?.id
    expect(boardsApi.moveTask).toHaveBeenCalledWith(board.id, logoTask?.id, {
      sectionId
    })
  })

  it('offers no edits to a viewer', async () => {
    const board = { ...designBoard(), role: 'viewer' as const }
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const logo = await screen.findByRole('article', { name: 'DES-1 Logo' })
    expect(
      within(logo).queryByRole('button', { name: 'Move DES-1' })
    ).not.toBeInTheDocument()
    expect(
      within(column('Done')).queryByRole('button', {
        name: 'Add a task to Done'
      })
    ).not.toBeInTheDocument()
  })

  it('says when a move fails', async () => {
    const board = designBoard()
    const boardsApi = fakeBoardsApi([board])
    boardsApi.moveTask.mockRejectedValue(new ApiError(409, 'archived'))
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const logo = await screen.findByRole('article', { name: 'DES-1 Logo' })
    fireEvent.click(within(logo).getByRole('button', { name: 'Move DES-1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Done' }))

    expect(
      await screen.findByText('The task could not be moved.')
    ).toBeInTheDocument()
  })

  it('says when the board does not exist', async () => {
    const boardsApi = fakeBoardsApi()
    boardsApi.getBoard.mockRejectedValue(new ApiError(404, 'not_found'))
    renderRoute('/boards/00000000-0000-7000-8000-000000000000', { boardsApi })

    expect(
      await screen.findByText("This board doesn't exist, or you can't open it.")
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Back to boards' })
    ).toHaveAttribute('href', '/')
  })
})
