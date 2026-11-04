import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Board } from '@/domain/board'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

function threeTasks(overrides: Partial<Board> = {}) {
  const board = aBoard(overrides)
  const [todo = null, , done = null] = board.sections
  board.tasks = ['Logo', 'Colors', 'Fonts'].map((title, index) =>
    aTask(todo, { key: `DES-${String(index + 1)}`, title })
  )
  const boardsApi = fakeBoardsApi([board])
  renderRoute(`/boards/${board.id}`, { boardsApi })
  return { board, boardsApi, done }
}

async function pick(...keys: string[]) {
  for (const key of keys) {
    fireEvent.click(
      await screen.findByRole('checkbox', { name: `Select ${key}` })
    )
  }
  return within(await screen.findByRole('toolbar', { name: 'Selected tasks' }))
}

describe('changing several tasks at once', () => {
  it('moves the picked tasks, and puts them back on undo', async () => {
    const { board, boardsApi, done } = threeTasks()
    const bar = await pick('DES-1', 'DES-2', 'DES-3')
    expect(bar.getByRole('status')).toHaveTextContent('3 selected')

    fireEvent.click(bar.getByRole('button', { name: 'Move to' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Done' }))

    expect(await screen.findByText('3 tasks updated')).toBeVisible()
    expect(boardsApi.changeTasks).toHaveBeenCalledWith(
      board.id,
      board.tasks.map(task => task.id),
      { kind: 'move', sectionId: done?.id }
    )
    expect(screen.queryByRole('toolbar')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => {
      expect(boardsApi.changeTasks).toHaveBeenLastCalledWith(
        board.id,
        board.tasks.map(task => task.id),
        { kind: 'move', sectionId: board.sections[0]?.id }
      )
    })
  })

  it('picks a run of tasks with Shift, and Escape lets them go', async () => {
    threeTasks()
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Select DES-1' })
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select DES-3' }), {
      shiftKey: true
    })

    const bar = within(screen.getByRole('toolbar', { name: 'Selected tasks' }))
    expect(bar.getByRole('status')).toHaveTextContent('3 selected')
    expect(screen.getByRole('checkbox', { name: 'Select DES-2' })).toBeChecked()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('toolbar')).toBeNull()
    })
  })

  it('keeps the tasks it could not change picked, and says how many', async () => {
    const { board, boardsApi } = threeTasks()
    const [, colors] = board.tasks
    boardsApi.archiveTask.mockImplementation((_boardId, taskId) =>
      taskId === colors?.id
        ? Promise.reject(new Error('gone'))
        : Promise.resolve()
    )
    const bar = await pick('DES-1', 'DES-2', 'DES-3')

    fireEvent.click(bar.getByRole('button', { name: 'Archive' }))

    expect(
      await screen.findByText('2 of 3 tasks updated. 1 could not be changed.')
    ).toBeVisible()
    const left = within(screen.getByRole('toolbar', { name: 'Selected tasks' }))
    expect(left.getByRole('status')).toHaveTextContent('1 selected')
  })

  it('asks before deleting the picked tasks', async () => {
    const { boardsApi } = threeTasks()
    const bar = await pick('DES-1', 'DES-2')

    fireEvent.click(bar.getByRole('button', { name: 'Delete' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Delete 2 tasks?' })
    )
    expect(
      dialog.getByText('They stay in the trash for 30 days.')
    ).toBeVisible()
    fireEvent.click(dialog.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('2 tasks deleted')).toBeVisible()
    expect(boardsApi.trashTask).toHaveBeenCalledTimes(2)
  })

  it('offers no picking to viewers', async () => {
    threeTasks({ role: 'viewer' })
    await screen.findByRole('button', { name: 'Logo' })
    expect(screen.queryByRole('checkbox', { name: 'Select DES-1' })).toBeNull()
  })
})
