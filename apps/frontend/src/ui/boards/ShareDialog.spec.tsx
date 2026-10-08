import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Project, Sharing } from '@/application/boards'
import { aBoard, aProject, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

const me = {
  userId: 'me',
  email: 'me@example.com',
  name: null,
  role: 'admin'
} as const

async function openSharing(
  members: Sharing['members'] = [me],
  projects: Project[] = []
) {
  const board = aBoard({ name: 'Design' })
  const boardsApi = fakeBoardsApi([board])
  boardsApi.sharings.set(board.id, { members, invites: [] })
  boardsApi.projects.push({ ...board.project, role: 'admin' }, ...projects)
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
    fireEvent.click(form.getByRole('button', { name: 'Role: Viewer' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editor' }))
    fireEvent.click(form.getByRole('button', { name: 'Invite' }))

    expect(await dialog.findByText('Invited bob@example.com.')).toBeVisible()
    expect(
      await dialog.findByRole('listitem', { name: 'bob@example.com' })
    ).toHaveTextContent('Pending')
    expect(boardsApi.invite).toHaveBeenCalledWith(
      board.id,
      'bob@example.com',
      'editor'
    )
  })

  it('changes a member role and removes a member', async () => {
    const { boardsApi, board, dialog } = await openSharing([
      me,
      {
        userId: 'bob',
        email: 'bob@example.com',
        name: 'Bob Durand',
        role: 'viewer'
      }
    ])
    const bob = within(
      await dialog.findByRole('listitem', { name: 'Bob Durand' })
    )
    expect(bob.getByText('bob@example.com')).toBeVisible()

    fireEvent.click(bob.getByRole('button', { name: 'Role: Viewer' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editor' }))
    await waitFor(() => {
      expect(boardsApi.setMemberRole).toHaveBeenCalledWith(
        board.id,
        'bob',
        'editor'
      )
    })
    fireEvent.click(await bob.findByRole('button', { name: 'Role: Editor' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))

    await waitFor(() => {
      expect(
        dialog.queryByRole('listitem', { name: 'bob@example.com' })
      ).toBeNull()
    })
  })

  it('cancels a pending invite', async () => {
    const board = aBoard({ name: 'Design' })
    const boardsApi = fakeBoardsApi([board])
    boardsApi.sharings.set(board.id, {
      members: [me],
      invites: [{ id: 'inv', email: 'eve@example.com', role: 'editor' }]
    })
    renderRoute(`/boards/${board.id}`, { boardsApi })
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
    const dialog = within(await screen.findByRole('dialog'))
    const eve = within(
      await dialog.findByRole('listitem', { name: 'eve@example.com' })
    )

    expect(eve.getByText('Pending')).toBeVisible()
    fireEvent.click(eve.getByRole('button', { name: 'Role: Editor' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancel invite' }))

    await waitFor(() => {
      expect(boardsApi.cancelInvite).toHaveBeenCalledWith(board.id, 'inv')
    })
  })

  it('moves the board into another project I edit', async () => {
    const board = aBoard({ name: 'Design' })
    const boardsApi = fakeBoardsApi([board])
    boardsApi.projects.push(
      { ...board.project, role: 'admin' },
      {
        ...aProject({ id: 'ops', name: 'Ops', managed: true }),
        role: 'editor'
      },
      { ...aProject({ id: 'hr', name: 'HR' }), role: 'viewer' },
      { ...aProject({ name: 'Personal', personal: true }), role: 'admin' }
    )
    renderRoute(`/boards/${board.id}`, { boardsApi })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Board options' })
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Move to project' })
    )
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Move Design' })
    )
    const project = await dialog.findByRole('combobox', { name: 'Project' })

    expect(
      within(project)
        .getAllByRole('option')
        .map(option => option.textContent)
    ).toEqual(['', 'Ops'])
    fireEvent.change(project, { target: { value: 'ops' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Move' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(boardsApi.moveToProject).toHaveBeenCalledWith(board.id, 'ops')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Share' })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
    })
  })

  it('names the project in the sharing help', async () => {
    const { dialog } = await openSharing()
    expect(
      dialog.getByText(
        'Sharing this board shares its project Design with everyone on it.'
      )
    ).toBeVisible()
  })

  it.each([
    [
      'a personal project',
      () => aBoard({ inbox: true, project: aProject({ personal: true }) }),
      'A board of your personal project is private. Move it to a project to share it.'
    ],
    [
      'a managed project',
      () => aBoard({ project: aProject({ managed: true }) }),
      'The members of this project are managed by its integration.'
    ],
    [
      'an archived board',
      () => aBoard({ archived: true }),
      "An archived board can't be shared."
    ],
    [
      'a non-admin',
      () => aBoard({ role: 'editor' }),
      'Only an admin can share this board.'
    ]
  ])('explains why %s cannot be shared', async (_name, make, reason) => {
    const board = make()
    renderRoute(`/boards/${board.id}`, { boardsApi: fakeBoardsApi([board]) })
    const button = await screen.findByRole('button', { name: 'Share' })

    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    fireEvent.keyDown(document.body, { key: 'Tab' })
    act(() => {
      button.focus()
    })
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(reason)
    expect(button).toHaveAttribute('aria-describedby', tooltip.id)

    fireEvent.click(button)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
