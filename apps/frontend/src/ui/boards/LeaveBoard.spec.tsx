import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Board } from '@/domain/board'
import { aBoard, aProject, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const alice = {
  userId: 'alice',
  email: 'alice@example.com',
  name: 'Alice Martin',
  avatar: null
}
const bob = {
  userId: 'bob',
  email: 'bob@example.com',
  name: 'Bob Durand',
  avatar: null
}

async function openMenu() {
  fireEvent.click(await screen.findByRole('button', { name: 'Board options' }))
  return within(await screen.findByRole('menu'))
}

const aSharedBoard = (overrides: Partial<Board> = {}) =>
  aBoard({
    name: 'Launch',
    role: 'editor',
    members: [alice, bob],
    ...overrides
  })

describe('leaving a board', () => {
  it('takes the board off the member, and says so in Boards', async () => {
    const board = aSharedBoard()
    const boardsApi = fakeBoardsApi([board, aBoard({ name: 'Roadmap' })])
    const { router } = renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click(
      (await openMenu()).getByRole('menuitem', { name: 'Leave board' })
    )
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Leave “Launch”?' })
    )
    expect(
      dialog.getByText(
        'You will no longer see it, and its tasks will no longer be assigned to you.'
      )
    ).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Leave' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
    expect(boardsApi.removeMember).toHaveBeenCalledWith(board.id, 'alice')
    expect(await screen.findByText('You left “Launch”')).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: 'Roadmap' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Launch' })).toBeNull()
  })

  it('warns that the other boards of the project go too', async () => {
    const board = aSharedBoard()
    const other = aBoard({ name: 'Press', project: board.project })
    renderRoute(`/boards/${board.id}`, {
      boardsApi: fakeBoardsApi([board, other])
    })

    fireEvent.click(
      (await openMenu()).getByRole('menuitem', { name: 'Leave board' })
    )

    const dialog = within(
      await screen.findByRole('dialog', { name: 'Leave “Launch”?' })
    )
    expect(
      await dialog.findByText(
        'You will no longer see it, nor the other board of its project “Design”, and their tasks will no longer be assigned to you.'
      )
    ).toBeInTheDocument()
  })

  it('explains to the last admin why they cannot leave', async () => {
    const board = aSharedBoard({ role: 'admin' })
    const boardsApi = fakeBoardsApi([board])
    boardsApi.sharings.set(board.id, {
      members: [
        { ...alice, role: 'admin' },
        { ...bob, role: 'editor' }
      ],
      invites: []
    })
    renderRoute(`/boards/${board.id}`, { boardsApi })

    fireEvent.click(
      (await openMenu()).getByRole('menuitem', { name: 'Leave board' })
    )

    const dialog = within(
      await screen.findByRole('dialog', { name: 'You can’t leave “Launch”' })
    )
    expect(
      dialog.getByText(
        'A project needs at least one admin. Make someone else admin first.'
      )
    ).toBeInTheDocument()
    expect(dialog.queryByRole('button', { name: 'Leave' })).toBeNull()
    expect(boardsApi.removeMember).not.toHaveBeenCalled()
  })

  it.each([
    { kind: 'personal', project: aProject({ personal: true }) },
    { kind: 'space', project: aProject({ managed: true }) }
  ])('is not offered on a $kind board', async ({ project }) => {
    const board = aSharedBoard({ project })
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })

    const menu = await openMenu()

    expect(menu.queryByRole('menuitem', { name: 'Leave board' })).toBeNull()
  })
})
