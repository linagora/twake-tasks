import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Board } from '@/domain/board'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

function eventBoard(overrides: Partial<Board> = {}) {
  const board = aBoard({ name: 'Launch', keyPrefix: 'FEA', ...overrides })
  const todo = board.sections[0] ?? null
  const venue = aTask(todo, {
    key: 'FEA-1',
    title: 'Book the venue',
    dueDate: '2026-11-20'
  })
  const release = aTask(todo, {
    key: 'FEA-2',
    title: 'Press release',
    dueDate: '2026-11-10'
  })
  board.tasks = [venue, release]
  return { board, venue, release, boardsApi: fakeBoardsApi([board]) }
}

async function openPanel(boardId: string, title: string, key: string) {
  fireEvent.click(await screen.findByRole('button', { name: title }))
  return within(await screen.findByRole('dialog', { name: `${key} ${title}` }))
}

async function addBlocker(
  panel: Awaited<ReturnType<typeof openPanel>>,
  choice: string,
  search: string,
  pick: string
) {
  fireEvent.click(panel.getByRole('button', { name: 'Add dependency' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: choice }))
  const picker = within(await screen.findByRole('dialog', { name: choice }))
  fireEvent.change(
    picker.getByRole('textbox', { name: 'Search by key or title' }),
    {
      target: { value: search }
    }
  )
  fireEvent.click(
    await picker.findByRole('menuitem', { name: new RegExp(pick) })
  )
  return picker
}

describe('Dependencies', () => {
  it('marks a task blocked by another, on its card and in both panels', async () => {
    const { board, boardsApi } = eventBoard()
    renderRoute(`/boards/${board.id}`, { boardsApi })
    const panel = await openPanel(board.id, 'Press release', 'FEA-2')

    await addBlocker(panel, 'Blocked by…', 'venue', 'FEA-1 Book the venue')

    const blockedBy = within(
      await panel.findByRole('list', { name: 'Blocked by' })
    )
    expect(blockedBy.getByText('Book the venue')).toBeVisible()
    expect(panel.getByText('Due before FEA-1, which blocks it.')).toBeVisible()
    expect(
      await screen.findByRole('img', {
        name: 'Blocked by FEA-1 Book the venue'
      })
    ).toBeVisible()

    fireEvent.click(blockedBy.getByRole('link', { name: 'Book the venue' }))
    const venue = within(
      await screen.findByRole('dialog', { name: 'FEA-1 Book the venue' })
    )
    expect(
      within(await venue.findByRole('list', { name: 'Blocks' })).getByText(
        'Press release'
      )
    ).toBeVisible()
  })

  it('removes a link', async () => {
    const { board, venue, release, boardsApi } = eventBoard()
    await boardsApi.addLink(board.id, release.id, 'blockedBy', venue.id)
    renderRoute(`/boards/${board.id}`, { boardsApi })
    const panel = await openPanel(board.id, 'Press release', 'FEA-2')

    fireEvent.click(
      await panel.findByRole('button', { name: 'Remove the link to FEA-1' })
    )

    await waitFor(() => {
      expect(boardsApi.removeLink).toHaveBeenCalledWith(
        board.id,
        release.id,
        venue.id
      )
    })
    expect(
      await within(
        panel.getByRole('region', { name: 'Dependencies' })
      ).findByText('None')
    ).toBeVisible()
  })

  it('refuses a cycle with the key that would block itself', async () => {
    const { board, venue, release, boardsApi } = eventBoard()
    const tour = aTask(board.sections[0] ?? null, {
      key: 'FEA-3',
      title: 'Press tour'
    })
    board.tasks.push(tour)
    await boardsApi.addLink(board.id, release.id, 'blockedBy', venue.id)
    await boardsApi.addLink(board.id, tour.id, 'blockedBy', release.id)
    renderRoute(`/boards/${board.id}`, { boardsApi })
    const panel = await openPanel(board.id, 'Book the venue', 'FEA-1')

    const picker = await addBlocker(
      panel,
      'Blocked by…',
      'tour',
      'FEA-3 Press tour'
    )

    expect(await picker.findByRole('alert')).toHaveTextContent(
      'This would make FEA-3 block itself.'
    )
  })

  it('shows a viewer the links, without add or remove', async () => {
    const { board, venue, release, boardsApi } = eventBoard({ role: 'viewer' })
    await boardsApi.addLink(board.id, release.id, 'blockedBy', venue.id)
    renderRoute(`/boards/${board.id}`, { boardsApi })
    const panel = await openPanel(board.id, 'Press release', 'FEA-2')

    expect(
      within(await panel.findByRole('list', { name: 'Blocked by' })).getByText(
        'Book the venue'
      )
    ).toBeVisible()
    expect(
      panel.queryByRole('button', { name: 'Add dependency' })
    ).not.toBeInTheDocument()
    expect(
      panel.queryByRole('button', { name: 'Remove the link to FEA-1' })
    ).not.toBeInTheDocument()
  })

  it('says a task is still blocked when it is moved to Done', async () => {
    const { board, venue, release, boardsApi } = eventBoard()
    await boardsApi.addLink(board.id, release.id, 'blockedBy', venue.id)
    renderRoute(`/boards/${board.id}`, { boardsApi })
    const panel = await openPanel(board.id, 'Press release', 'FEA-2')

    fireEvent.mouseDown(panel.getByRole('combobox', { name: 'Section' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Done' }))

    expect(
      await screen.findByText('FEA-2 is still blocked by FEA-1.')
    ).toBeVisible()
  })
})
