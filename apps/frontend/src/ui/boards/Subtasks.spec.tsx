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

async function logoCard() {
  const card = within(
    await screen.findByRole('article', { name: 'DES-1 Logo' })
  )
  const progress = card.getByRole('button', { name: /^Sub-tasks, / })
  if (progress.getAttribute('aria-expanded') === 'false') {
    fireEvent.click(progress)
  }
  return card
}

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
    const title = panel.getByRole('textbox', { name: 'Sub-task title' })
    expect(title).toHaveFocus()
    fireEvent.change(title, { target: { value: 'Colors' } })
    fireEvent.click(panel.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(boardsApi.createTask).toHaveBeenCalledWith(board.id, {
        parentId: logo.id,
        title: 'Colors'
      })
    })
    fireEvent.click(panel.getByRole('button', { name: 'Close' }))
    expect(
      await (await logoCard()).findByRole('checkbox', { name: 'Colors' })
    ).toBeInTheDocument()
  })

  it('closes the sub-task form on Escape, not the panel', async () => {
    const { board, boardsApi } = logoWithSketch()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click((await logoCard()).getByRole('button', { name: 'Logo' }))
    const panel = within(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    )
    fireEvent.click(panel.getByRole('button', { name: 'Add a sub-task' }))
    const title = panel.getByRole('textbox', { name: 'Sub-task title' })
    fireEvent.change(title, { target: { value: 'half' } })
    fireEvent.keyDown(title, { key: 'Escape' })

    expect(
      panel.queryByRole('textbox', { name: 'Sub-task title' })
    ).not.toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Add a sub-task' })).toHaveFocus()
    expect(
      screen.getByRole('dialog', { name: 'DES-1 Logo' })
    ).toBeInTheDocument()
    expect(boardsApi.createTask).not.toHaveBeenCalled()

    fireEvent.keyDown(panel.getByRole('button', { name: 'Add a sub-task' }), {
      key: 'Escape'
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'DES-1 Logo' })).toBeNull()
    })
  })

  it('leaves the field of a sub-task on Escape, then closes the sub-task alone', async () => {
    const { board, boardsApi } = logoWithSketch()
    renderRoute(`/boards/${board.id}?task=DES-1`, { boardsApi })

    const parent = within(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    )
    fireEvent.click(await parent.findByRole('button', { name: 'Sketch' }))
    const sub = await screen.findByRole('dialog', { name: 'DES-2 Sketch' })
    const title = within(sub).getByRole('textbox', { name: 'Title' })
    title.focus()
    fireEvent.change(title, { target: { value: 'Sketches' } })
    fireEvent.keyDown(title, { key: 'Escape' })

    expect(sub).toHaveFocus()
    expect(title).toHaveValue('Sketch')
    expect(screen.getByRole('dialog', { name: 'DES-2 Sketch' })).toBeVisible()
    expect(screen.getByRole('dialog', { name: 'DES-1 Logo' })).toBeVisible()
    expect(boardsApi.editTask).not.toHaveBeenCalled()

    fireEvent.keyDown(sub, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'DES-2 Sketch' })).toBeNull()
    })
    expect(screen.getByRole('dialog', { name: 'DES-1 Logo' })).toBeVisible()
  })

  it('gives the focus back to Add a sub-task on Cancel', async () => {
    const { board, boardsApi } = logoWithSketch()
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click((await logoCard()).getByRole('button', { name: 'Logo' }))
    const panel = within(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    )
    fireEvent.click(panel.getByRole('button', { name: 'Add a sub-task' }))
    fireEvent.click(panel.getByRole('button', { name: 'Cancel' }))

    expect(panel.getByRole('button', { name: 'Add a sub-task' })).toHaveFocus()
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
