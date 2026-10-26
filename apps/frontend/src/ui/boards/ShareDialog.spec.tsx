import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError, type Project, type Sharing } from '@/application/boards'
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

    fireEvent.change(form.getByRole('combobox', { name: 'Email' }), {
      target: { value: 'bob@example.com' }
    })
    fireEvent.click(form.getByRole('button', { name: 'Role: Editor' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Viewer' }))
    fireEvent.click(form.getByRole('button', { name: 'Invite' }))

    expect(
      await dialog.findByText(
        'Invited bob@example.com. You can assign them tasks once they open Twake Project.'
      )
    ).toBeVisible()
    expect(
      await dialog.findByRole('listitem', { name: 'bob@example.com' })
    ).toHaveTextContent('Pending')
    expect(boardsApi.invite).toHaveBeenCalledWith(
      board.id,
      'bob@example.com',
      'viewer'
    )
  })

  it('invites as an editor unless told otherwise', async () => {
    const { boardsApi, board, dialog } = await openSharing()
    const form = within(dialog.getByRole('form', { name: 'Invite' }))

    fireEvent.change(form.getByRole('combobox', { name: 'Email' }), {
      target: { value: 'bob@example.com' }
    })
    fireEvent.click(form.getByRole('button', { name: 'Invite' }))

    await dialog.findByText(/^Invited bob@example.com\./)
    expect(boardsApi.invite).toHaveBeenCalledWith(
      board.id,
      'bob@example.com',
      'editor'
    )
  })

  it.each([
    ['the invite', 'Role: Editor'],
    ['a member', 'Role of me@example.com: Admin']
  ])('says what each role allows in the menu of %s', async (_name, menu) => {
    const { dialog } = await openSharing([
      me,
      { userId: 'bob', email: 'bob@example.com', name: null, role: 'admin' }
    ])

    fireEvent.click(await dialog.findByRole('button', { name: menu }))

    expect(
      screen.getByRole('menuitem', { name: 'Viewer' })
    ).toHaveAccessibleDescription('Sees tasks and comments on them')
    expect(
      screen.getByRole('menuitem', { name: 'Editor' })
    ).toHaveAccessibleDescription('Adds, edits and moves tasks')
    expect(
      screen.getByRole('menuitem', { name: 'Admin' })
    ).toHaveAccessibleDescription(
      'Also manages sections, sharing and the board'
    )
  })

  it('keeps the keyboard in the Email field after a click on Invite', async () => {
    const { dialog } = await openSharing()
    const email = dialog.getByRole('combobox', { name: 'Email' })
    const invite = dialog.getByRole('button', { name: 'Invite' })

    fireEvent.change(email, { target: { value: 'bob@example.com' } })
    act(() => {
      invite.focus()
    })
    fireEvent.click(invite)

    expect(await dialog.findByText(/^Invited bob@example.com\./)).toBeVisible()
    expect(email).toHaveFocus()
  })

  it('suggests people by name and invites the one picked', async () => {
    const board = aBoard({ name: 'Design' })
    const boardsApi = fakeBoardsApi([board])
    boardsApi.sharings.set(board.id, { members: [me], invites: [] })
    boardsApi.directory.push(
      { userId: 'ada', email: 'ada@example.com', name: 'Ada Lovelace' },
      { userId: 'bob', email: 'bob@example.com', name: 'Bob' }
    )
    renderRoute(`/boards/${board.id}`, { boardsApi })
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Share Design' })
    )
    const email = dialog.getByRole('combobox', { name: 'Email' })

    fireEvent.change(email, { target: { value: 'love' } })
    fireEvent.click(await screen.findByRole('option', { name: /Ada Lovelace/ }))

    expect(email).toHaveValue('ada@example.com')
    expect(screen.queryByRole('option', { name: /Bob/ })).toBeNull()
    fireEvent.click(dialog.getByRole('button', { name: 'Invite' }))
    expect(await dialog.findByText(/^Invited ada@example.com\./)).toBeVisible()
    expect(boardsApi.suggestPeople).toHaveBeenCalledWith(board.id, 'love')
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

    fireEvent.click(
      bob.getByRole('button', { name: 'Role of Bob Durand: Viewer' })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editor' }))
    await waitFor(() => {
      expect(boardsApi.setMemberRole).toHaveBeenCalledWith(
        board.id,
        'bob',
        'editor'
      )
    })
    fireEvent.click(
      await bob.findByRole('button', { name: 'Role of Bob Durand: Editor' })
    )
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
    fireEvent.click(
      eve.getByRole('button', { name: 'Role of eve@example.com: Editor' })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancel invite' }))

    await waitFor(() => {
      expect(boardsApi.cancelInvite).toHaveBeenCalledWith(board.id, 'inv')
    })
  })

  it.each([
    ['removing a member', 'Bob Durand', 'Remove'],
    ['cancelling an invite', 'eve@example.com', 'Cancel invite']
  ])(
    'keeps the keyboard in the dialog after %s',
    async (_name, person, action) => {
      const board = aBoard({ name: 'Design' })
      const boardsApi = fakeBoardsApi([board])
      boardsApi.sharings.set(board.id, {
        members: [
          me,
          {
            userId: 'bob',
            email: 'bob@example.com',
            name: 'Bob Durand',
            role: 'editor'
          }
        ],
        invites: [{ id: 'inv', email: 'eve@example.com', role: 'editor' }]
      })
      renderRoute(`/boards/${board.id}`, { boardsApi })
      fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
      const dialog = within(await screen.findByRole('dialog'))
      const row = within(await dialog.findByRole('listitem', { name: person }))
      const role = row.getByRole('button', {
        name: `Role of ${person}: Editor`
      })

      act(() => {
        role.focus()
      })
      fireEvent.click(role)
      fireEvent.click(screen.getByRole('menuitem', { name: action }))

      await waitFor(() => {
        expect(dialog.queryByRole('listitem', { name: person })).toBeNull()
      })
      await waitFor(() => {
        expect(dialog.getByRole('combobox', { name: 'Email' })).toHaveFocus()
      })
    }
  )

  it('names the dialog after its title only', async () => {
    await openSharing()
    const label = document.getElementById(
      screen.getByRole('dialog').getAttribute('aria-labelledby') ?? ''
    )
    expect(label).toHaveTextContent(/^Share Design$/)
    expect(label?.querySelector('button')).toBeNull()
  })

  it('keeps the only admin from demoting or removing themselves', async () => {
    const { boardsApi, dialog } = await openSharing()

    fireEvent.click(
      await dialog.findByRole('button', {
        name: 'Role of me@example.com: Admin'
      })
    )

    expect(
      screen.getByText(
        'A project needs at least one admin. Make someone else admin first.'
      )
    ).toBeVisible()
    for (const name of ['Viewer', 'Editor', 'Remove']) {
      expect(screen.getByRole('menuitem', { name })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
    }
    expect(boardsApi.setMemberRole).not.toHaveBeenCalled()
  })

  it('explains a refusal to leave the project without an admin', async () => {
    const { boardsApi, dialog } = await openSharing([
      me,
      { userId: 'bob', email: 'bob@example.com', name: null, role: 'admin' }
    ])
    boardsApi.setMemberRole.mockRejectedValueOnce(
      new ApiError(409, 'last_admin')
    )

    fireEvent.click(
      await dialog.findByRole('button', {
        name: 'Role of me@example.com: Admin'
      })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Viewer' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'A project needs at least one admin. Make someone else admin first.'
    )
  })

  it('shows only the outcome of the last action', async () => {
    const { boardsApi, dialog } = await openSharing([
      me,
      { userId: 'bob', email: 'bob@example.com', name: null, role: 'viewer' }
    ])
    const form = within(dialog.getByRole('form', { name: 'Invite' }))
    fireEvent.change(form.getByRole('combobox', { name: 'Email' }), {
      target: { value: 'eve@example.com' }
    })
    fireEvent.click(form.getByRole('button', { name: 'Invite' }))
    expect(await dialog.findByText(/^Invited eve@example.com\./)).toBeVisible()

    boardsApi.setMemberRole.mockRejectedValueOnce(new ApiError(500, null))
    fireEvent.click(
      dialog.getByRole('button', { name: 'Role of bob@example.com: Viewer' })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editor' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'The change could not be saved.'
    )
    expect(dialog.queryByText(/^Invited eve@example.com\./)).toBeNull()

    fireEvent.click(
      await dialog.findByRole('button', {
        name: 'Role of eve@example.com: Editor'
      })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancel invite' }))
    await waitFor(() => {
      expect(dialog.queryByRole('alert')).toBeNull()
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

  it('speaks of the board alone when it is the only one of its project', async () => {
    const { dialog } = await openSharing()
    expect(
      await dialog.findByText(
        'People you invite can open this board. An invite only works for an account in your own organization.'
      )
    ).toBeVisible()
  })

  it.each([
    [['Roadmap'], 'Design, Roadmap'],
    [['B2', 'B3', 'B4', 'B5', 'B6', 'B7'], 'Design, B2, B3, B4, B5 and 2 more']
  ])(
    'names the boards of the project the invite opens: %j',
    async (others, listed) => {
      const project = aProject({ name: 'Website' })
      const board = aBoard({ name: 'Design', project })
      const boardsApi = fakeBoardsApi([
        ...others.map(name => aBoard({ name, project })),
        board,
        aBoard({ name: 'Elsewhere' })
      ])
      boardsApi.sharings.set(board.id, { members: [me], invites: [] })
      boardsApi.projects.push({ ...project, role: 'admin' })
      renderRoute(`/boards/${board.id}`, { boardsApi })
      fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
      const dialog = within(
        await screen.findByRole('dialog', { name: 'Share Design' })
      )

      expect(
        await dialog.findByText(
          `People you invite can open every board of the project “Website”: ${listed}. An invite only works for an account in your own organization.`
        )
      ).toBeVisible()
    }
  )

  it('says an invite only works inside the organization', async () => {
    const { dialog } = await openSharing()
    expect(
      dialog.getByText(
        /An invite only works for an account in your own organization\./
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
      () =>
        aBoard({
          project: aProject({ name: 'Product launch', managed: true })
        }),
      'The members of this board are the members of the space Product launch. Manage them in TwakeSpace.'
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
