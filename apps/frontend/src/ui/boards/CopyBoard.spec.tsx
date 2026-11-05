import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aProject, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

async function openMenu() {
  fireEvent.click(await screen.findByRole('button', { name: 'Board options' }))
  return within(await screen.findByRole('menu'))
}

describe('copying a board', () => {
  it('copies the board into its project and opens the copy', async () => {
    const board = aBoard({ name: 'Launch', keyPrefix: 'LCH' })
    const [todo = null, , done = null] = board.sections
    board.tasks = [
      aTask(todo, { key: 'LCH-1', title: 'Brief' }),
      aTask(done, {
        key: 'LCH-2',
        title: 'Kickoff',
        completedAt: '2026-01-01T00:00:00Z'
      })
    ]
    const boardsApi = fakeBoardsApi([board])
    boardsApi.projects.push(
      { ...board.project, role: 'admin' },
      { ...aProject({ id: 'hr', name: 'HR' }), role: 'viewer' }
    )
    const { router } = renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click(
      (await openMenu()).getByRole('menuitem', { name: 'Copy board' })
    )
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Copy Launch' })
    )
    expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue(
      'Launch (copy)'
    )
    const project = await dialog.findByRole('combobox', { name: 'Project' })
    await waitFor(() => {
      expect(project).toHaveValue(board.project.id)
    })
    expect(
      within(project)
        .getAllByRole('option')
        .map(option => option.textContent)
    ).toEqual(['Design', 'A new project'])
    expect(
      dialog.getByRole('checkbox', { name: 'Open tasks and their sub-tasks' })
    ).toBeChecked()
    fireEvent.click(dialog.getByRole('checkbox', { name: 'Keep due dates' }))
    fireEvent.change(dialog.getByRole('textbox', { name: 'Key prefix' }), {
      target: { value: 'LCHB' }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Copy' }))

    await waitFor(() => {
      expect(router.state.location.pathname).not.toBe(`/boards/${board.id}`)
    })
    expect(boardsApi.createBoard).toHaveBeenCalledWith({
      name: 'Launch (copy)',
      keyPrefix: 'LCHB',
      language: 'en',
      projectId: board.project.id,
      copyOf: {
        boardId: board.id,
        tasks: true,
        assignees: true,
        dueDates: true
      }
    })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Launch (copy)' })
    ).toBeInTheDocument()
    expect(await screen.findByText('Brief')).toBeInTheDocument()
    expect(screen.queryByText('Kickoff')).toBeNull()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('offers neither copying nor templates to a viewer', async () => {
    const board = aBoard({ role: 'viewer' })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const menu = await openMenu()

    expect(menu.queryByRole('menuitem', { name: 'Copy board' })).toBeNull()
    expect(
      menu.queryByRole('menuitem', { name: 'Use as board template' })
    ).toBeNull()
  })
})

describe('board templates', () => {
  it('starts a new board from a board marked as a template', async () => {
    const template = aBoard({ name: 'Event', keyPrefix: 'EVT' })
    const [todo = null] = template.sections
    template.tasks = [aTask(todo, { key: 'EVT-1', title: 'Book the room' })]
    const boardsApi = fakeBoardsApi([template])
    renderRoute(`/boards/${template.id}`, { boardsApi })

    fireEvent.click(
      (await openMenu()).getByRole('menuitem', {
        name: 'Use as board template'
      })
    )
    await waitFor(() => {
      expect(boardsApi.setBoardTemplate).toHaveBeenCalledWith(template.id, true)
    })
    expect(
      (await openMenu()).getByRole('menuitem', {
        name: 'Stop using as board template'
      })
    ).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })

    fireEvent.click(await screen.findByRole('button', { name: 'New board' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'New board' })
    )
    const startFrom = await dialog.findByRole('combobox', {
      name: 'Start from'
    })
    expect(
      within(startFrom)
        .getAllByRole('option')
        .map(option => option.textContent)
    ).toEqual(['Empty board', 'Event'])
    fireEvent.change(startFrom, { target: { value: template.id } })
    expect(
      dialog.getByText('Its sections, its labels and 1 open task.')
    ).toBeInTheDocument()
    fireEvent.change(dialog.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Summit' }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(boardsApi.createBoard).toHaveBeenCalledWith({
        name: 'Summit',
        keyPrefix: 'SUM',
        language: 'en',
        copyOf: {
          boardId: template.id,
          tasks: true,
          assignees: false,
          dueDates: false
        }
      })
    })
    expect(await screen.findByText('Book the room')).toBeInTheDocument()
  })
})
