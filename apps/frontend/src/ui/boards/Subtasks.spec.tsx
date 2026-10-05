import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

function logoWithSketch() {
  const board = aBoard({ name: 'Design', keyPrefix: 'DES' })
  const logo = aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
  const sketch = aTask(null, {
    key: 'DES-2',
    title: 'Sketch',
    parentId: logo.id
  })
  board.tasks = [logo, sketch]
  return { board, logo, sketch, boardsApi: fakeBoardsApi([board]) }
}

const logoCard = async () =>
  within(await screen.findByRole('article', { name: 'DES-1 Logo' }))

describe('Sub-tasks', () => {
  it('shows sub-tasks inside their parent, not as a column', async () => {
    const { board, boardsApi } = logoWithSketch()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    const card = await logoCard()

    expect(card.getByRole('checkbox', { name: 'Sketch' })).not.toBeChecked()
    expect(
      screen.queryByRole('region', { name: 'No section' })
    ).not.toBeInTheDocument()
  })

  it('completes a sub-task with its checkbox', async () => {
    const { board, sketch, boardsApi } = logoWithSketch()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click(
      (await logoCard()).getByRole('checkbox', { name: 'Sketch' })
    )

    await waitFor(() => {
      expect(boardsApi.completeTask).toHaveBeenCalledWith(
        board.id,
        sketch.id,
        'completed'
      )
    })
    expect(
      await (await logoCard()).findByRole('checkbox', { name: 'Sketch' })
    ).toBeChecked()
  })

  it('adds a sub-task from its parent', async () => {
    const { board, logo, boardsApi } = logoWithSketch()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click((await logoCard()).getByRole('button', { name: 'Logo' }))
    const panel = within(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    )
    fireEvent.click(panel.getByRole('button', { name: 'Add a sub-task' }))
    fireEvent.change(panel.getByRole('textbox', { name: 'Sub-task title' }), {
      target: { value: 'Colors' }
    })
    fireEvent.click(panel.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(boardsApi.createTask).toHaveBeenCalledWith(board.id, {
        parentId: logo.id,
        title: 'Colors'
      })
    })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(
      await (await logoCard()).findByRole('checkbox', { name: 'Colors' })
    ).toBeInTheDocument()
  })

  it('stops adding sub-tasks at the fourth level', async () => {
    const { board, sketch, boardsApi } = logoWithSketch()
    const colors = aTask(null, {
      key: 'DES-3',
      title: 'Colors',
      parentId: sketch.id
    })
    const swatch = aTask(null, {
      key: 'DES-4',
      title: 'Swatch',
      parentId: colors.id
    })
    board.tasks.push(colors, swatch)
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click((await logoCard()).getByRole('button', { name: 'Swatch' }))
    const panel = within(
      await screen.findByRole('dialog', { name: 'DES-4 Swatch' })
    )

    expect(
      await panel.findByRole('button', { name: 'Edit description' })
    ).toBeInTheDocument()
    expect(
      panel.queryByRole('button', { name: 'Add a sub-task' })
    ).not.toBeInTheDocument()
  })
})
