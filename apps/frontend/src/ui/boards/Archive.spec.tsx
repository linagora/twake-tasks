import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Board } from '@/domain/board'
import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { findEmptyState } from '@/testing/emptyState'
import { renderRoute } from '@/testing/renderWithProviders'

function logoBoard(overrides: Partial<Board> = {}) {
  const board = aBoard({ name: 'Design', ...overrides })
  const logo = aTask(board.sections[0] ?? null, { key: 'DES-1', title: 'Logo' })
  board.tasks = [logo]
  const boardsApi = fakeBoardsApi([board])
  const { router } = renderRoute(`/boards/${board.id}`, { boardsApi })
  return { board, logo, boardsApi, router }
}

async function removeLogo(action: 'Archive' | 'Delete') {
  fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
  const panel = within(
    await screen.findByRole('dialog', { name: 'DES-1 Logo' })
  )
  fireEvent.click(panel.getByRole('button', { name: 'Task options' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: action }))
  await waitFor(() => {
    expect(screen.queryByRole('button', { name: 'Logo' })).toBeNull()
  })
}

async function boardMenu() {
  fireEvent.click(await screen.findByRole('button', { name: 'Board options' }))
  return within(await screen.findByRole('menu'))
}

async function openShelf(name: 'Archived tasks' | 'Trash') {
  fireEvent.click((await boardMenu()).getByRole('menuitem', { name }))
  await screen.findByRole('heading', { name, level: 1 })
  return within(screen.getByRole('main'))
}

describe('archive and trash', () => {
  it('archives a task and restores it from the archived tasks', async () => {
    const { board, logo, boardsApi } = logoBoard()

    await removeLogo('Archive')
    expect(boardsApi.archiveTask).toHaveBeenCalledWith(board.id, logo.id)
    expect(screen.queryByText(/This task doesn't exist/)).toBeNull()
    const shelf = await openShelf('Archived tasks')
    const item = within(
      await shelf.findByRole('listitem', { name: 'DES-1 Logo' })
    )
    fireEvent.click(item.getByRole('button', { name: 'Restore DES-1' }))
    const empty = await findEmptyState('No archived tasks')
    expect(empty).toHaveTextContent(
      'Archive a task to hide it from the board without deleting it.'
    )
    expect(
      empty.querySelector('svg')?.closest('[aria-hidden="true"]')
    ).not.toBe(null)
    fireEvent.click(
      within(
        await screen.findByRole('status', {
          name: 'DES-1 is back on the board'
        })
      ).getByRole('button', { name: 'Open' })
    )

    expect(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    ).toBeVisible()
    expect(screen.queryByText(/This task doesn't exist/)).toBeNull()
    expect(boardsApi.restoreTask).toHaveBeenCalledWith(board.id, logo.id)
  })

  it('sends a task to the trash, which says when it is purged', async () => {
    const { board, logo, boardsApi } = logoBoard()

    await removeLogo('Delete')

    expect(boardsApi.trashTask).toHaveBeenCalledWith(board.id, logo.id)
    const shelf = await openShelf('Trash')
    const item = within(
      await shelf.findByRole('listitem', { name: 'DES-1 Logo' })
    )
    expect(
      shelf.getByText('Tasks in the trash are deleted for good after 30 days.')
    ).toBeVisible()
    expect(item.getByText('30 days left')).toBeVisible()
    expect(item.getByText('this minute')).toBeVisible()
  })

  it('switches between the archived tasks and the trash, and goes back to the board', async () => {
    logoBoard()

    await removeLogo('Archive')
    const shelf = await openShelf('Trash')
    expect(await findEmptyState('The trash is empty')).toBeVisible()
    fireEvent.click(shelf.getByRole('button', { name: 'Archived' }))
    expect(
      await screen.findByRole('heading', { name: 'Archived tasks', level: 1 })
    ).toBeVisible()
    expect(
      await shelf.findByRole('listitem', { name: 'DES-1 Logo' })
    ).toBeVisible()

    fireEvent.click(shelf.getByRole('link', { name: 'Back to Design' }))
    expect(
      await screen.findByRole('button', { name: 'Board options' })
    ).toBeVisible()
  })

  it('shows a trashed task read only, and restores it from there', async () => {
    const { board, logo, boardsApi } = logoBoard()

    await removeLogo('Delete')
    const shelf = await openShelf('Trash')
    fireEvent.click(await shelf.findByRole('button', { name: 'Logo' }))

    const panel = within(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    )
    expect(panel.queryByRole('button', { name: 'Task options' })).toBeNull()
    const crumbs = within(
      panel.getByRole('navigation', { name: 'Where the task is' })
    )
    expect(crumbs.getByRole('link', { name: 'Design' })).toHaveAttribute(
      'href',
      `/boards/${board.id}`
    )
    expect(
      panel.getByText('In the trash, deleted for good in 30 days.')
    ).toBeVisible()
    expect(panel.queryByRole('button', { name: 'Send' })).toBeNull()
    fireEvent.click(panel.getByRole('button', { name: 'Restore DES-1' }))

    expect(await findEmptyState('The trash is empty')).toBeVisible()
    expect(boardsApi.restoreTask).toHaveBeenCalledWith(board.id, logo.id)
    expect(screen.queryByRole('dialog', { name: 'DES-1 Logo' })).toBeNull()
  })

  it('says a task is back on the board when its row restores it from the trash', async () => {
    const { boardsApi } = logoBoard()

    await removeLogo('Delete')
    const shelf = await openShelf('Trash')
    const getBoard = boardsApi.getBoard.getMockImplementation()
    if (!getBoard) throw new Error('getBoard is not faked')
    boardsApi.getBoard.mockImplementation(async (...args) => {
      await new Promise(resolve => setTimeout(resolve, 300))
      return getBoard(...args)
    })
    const item = within(
      await shelf.findByRole('listitem', { name: 'DES-1 Logo' })
    )
    fireEvent.click(item.getByRole('button', { name: 'Restore DES-1' }))

    expect(
      await screen.findByRole('status', { name: 'DES-1 is back on the board' })
    ).toBeVisible()
  })

  it('leaves the task panel the user moved to alone once a row has restored its task', async () => {
    const { boardsApi, router } = logoBoard()

    await removeLogo('Delete')
    const shelf = await openShelf('Trash')
    const getBoard = boardsApi.getBoard.getMockImplementation()
    if (!getBoard) throw new Error('getBoard is not faked')
    boardsApi.getBoard.mockImplementation(async (...args) => {
      await new Promise(resolve => setTimeout(resolve, 300))
      void router.navigate(
        { pathname: router.state.location.pathname, search: '?task=DES-2' },
        { replace: true }
      )
      return getBoard(...args)
    })
    const item = within(
      await shelf.findByRole('listitem', { name: 'DES-1 Logo' })
    )
    fireEvent.click(item.getByRole('button', { name: 'Restore DES-1' }))

    await screen.findByRole('status', { name: 'DES-1 is back on the board' })
    expect(router.state.location.search).toBe('?task=DES-2')
  })

  it('says where a deleted task went and opens the trash from there', async () => {
    logoBoard()

    await removeLogo('Delete')
    const notice = within(
      await screen.findByRole('status', { name: 'DES-1 moved to the trash' })
    )
    fireEvent.click(notice.getByRole('button', { name: 'View trash' }))

    await screen.findByRole('heading', { name: 'Trash', level: 1 })
    const shelf = within(screen.getByRole('main'))
    expect(
      await shelf.findByRole('listitem', { name: 'DES-1 Logo' })
    ).toBeVisible()
    expect(
      screen.queryByRole('status', { name: 'DES-1 moved to the trash' })
    ).toBeNull()
  })

  it('undoes an archive from the notice', async () => {
    const { board, logo, boardsApi } = logoBoard()

    await removeLogo('Archive')
    const notice = within(
      await screen.findByRole('status', { name: 'DES-1 archived' })
    )
    expect(
      notice.getByRole('button', { name: 'View archived tasks' })
    ).toBeVisible()
    fireEvent.click(notice.getByRole('button', { name: 'Undo' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('status', { name: 'DES-1 archived' })
      ).toBeNull()
    })
    expect(boardsApi.restoreTask).toHaveBeenCalledWith(board.id, logo.id)
    expect(
      await screen.findByRole('button', { name: 'Logo' }, { timeout: 3000 })
    ).toBeVisible()
  })

  it('archives a board, which becomes read only', async () => {
    const { board, boardsApi } = logoBoard()

    fireEvent.click(
      (await boardMenu()).getByRole('menuitem', { name: 'Archive board' })
    )

    expect(
      await screen.findByText('This board is archived and read only.')
    ).toBeVisible()
    expect(boardsApi.setBoardArchived).toHaveBeenCalledWith(board.id, true)
    expect(
      screen.queryByRole('button', { name: 'Add a task to To do' })
    ).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull()
    fireEvent.click(
      (await boardMenu()).getByRole('menuitem', { name: 'Unarchive board' })
    )
    expect(
      await (
        await boardMenu()
      ).findByRole('menuitem', {
        name: 'Archive board'
      })
    ).toBeVisible()
  })

  it('lets viewers see the shelves but not change them', async () => {
    logoBoard({ role: 'viewer' })

    const menu = await boardMenu()
    expect(menu.getByRole('menuitem', { name: 'Trash' })).toBeVisible()
    expect(menu.queryByRole('menuitem', { name: 'Archive board' })).toBeNull()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })

    fireEvent.click(await screen.findByRole('button', { name: 'Logo' }))
    const panel = within(
      await screen.findByRole('dialog', { name: 'DES-1 Logo' })
    )
    expect(panel.queryByRole('button', { name: 'Task options' })).toBeNull()
  })
})
