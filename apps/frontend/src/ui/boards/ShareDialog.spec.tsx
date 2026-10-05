import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Sharing } from '@/application/boards'
import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const me = { userId: 'me', email: 'me@example.com', role: 'admin' } as const

async function openSharing(members: Sharing['members'] = [me]) {
  const board = aBoard({ name: 'Design' })
  const boardsApi = fakeBoardsApi([board])
  boardsApi.sharings.set(board.id, { members, invites: [] })
  renderRoute(`/boards/${board.id}`, { boardsApi })
  fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
  return {
    boardsApi,
    board,
    dialog: within(await screen.findByRole('dialog', { name: 'Share Design' }))
  }
}

describe('sharing a board', () => {
  it('invites someone by email with a role', async () => {
    const { boardsApi, board, dialog } = await openSharing()
    const form = within(dialog.getByRole('form', { name: 'Invite' }))

    fireEvent.change(form.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'bob@example.com' }
    })
    fireEvent.change(form.getByRole('combobox', { name: 'Role' }), {
      target: { value: 'editor' }
    })
    fireEvent.click(form.getByRole('button', { name: 'Invite' }))

    expect(await dialog.findByText('Invited bob@example.com.')).toBeVisible()
    expect(
      await dialog.findByRole('listitem', { name: 'bob@example.com' })
    ).toHaveTextContent('Invited')
    expect(boardsApi.invite).toHaveBeenCalledWith(
      board.id,
      'bob@example.com',
      'editor'
    )
  })

  it('changes a member role and removes a member', async () => {
    const { boardsApi, board, dialog } = await openSharing([
      me,
      { userId: 'bob', email: 'bob@example.com', role: 'viewer' }
    ])
    const bob = within(
      await dialog.findByRole('listitem', { name: 'bob@example.com' })
    )

    fireEvent.change(bob.getByRole('combobox', { name: 'Role' }), {
      target: { value: 'editor' }
    })
    await waitFor(() => {
      expect(boardsApi.setMemberRole).toHaveBeenCalledWith(
        board.id,
        'bob',
        'editor'
      )
    })
    fireEvent.click(bob.getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(
        dialog.queryByRole('listitem', { name: 'bob@example.com' })
      ).toBeNull()
    })
  })

  it('offers sharing only to admins of their own boards', async () => {
    for (const board of [
      aBoard({ role: 'editor' }),
      aBoard({ inbox: true }),
      aBoard({ spaceId: 'space' })
    ]) {
      const view = renderRoute(`/boards/${board.id}`, {
        boardsApi: fakeBoardsApi([board])
      })
      await screen.findByRole('heading', { level: 1 })
      expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
      view.unmount()
    }
  })
})
