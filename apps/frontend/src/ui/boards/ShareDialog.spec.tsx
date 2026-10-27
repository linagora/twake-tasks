import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
  type BoundFunctions,
  type queries
} from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError, type Project, type Sharing } from '@/application/boards'
import { aBoard, aProject, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderRoute } from '@/testing/renderWithProviders'

// The person signed in, as the session knows them.
const me = {
  userId: 'me',
  email: 'alice@example.com',
  name: 'Alice Martin',
  role: 'admin'
} as const

const bob = {
  userId: 'bob',
  email: 'bob@example.com',
  name: 'Bob Durand',
  role: 'viewer'
} as const

async function openSharing(
  members: Sharing['members'] = [me],
  projects: Project[] = []
) {
  const board = aBoard({ name: 'Design' })
  const boardsApi = fakeBoardsApi([board])
  // The fake changes the members in place: each test gets its own.
  boardsApi.sharings.set(board.id, {
    members: members.map(member => ({ ...member })),
    invites: []
  })
  boardsApi.projects.push({ ...board.project, role: 'admin' }, ...projects)
  renderRoute(`/boards/${board.id}`, { boardsApi })
  fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
  return {
    boardsApi,
    board,
    dialog: within(await screen.findByRole('dialog', { name: 'Share Design' }))
  }
}

const field = (dialog: BoundFunctions<typeof queries>) =>
  dialog.getByRole('combobox', { name: 'Email' })

function type(dialog: BoundFunctions<typeof queries>, text: string) {
  fireEvent.change(field(dialog), { target: { value: text } })
}

describe('sharing a board', () => {
  it('invites someone by email with a role', async () => {
    const { boardsApi, board, dialog } = await openSharing()

    type(dialog, 'bob@example.com')
    fireEvent.click(dialog.getByRole('button', { name: 'Role: Editor' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Viewer' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Share' }))

    expect(
      await dialog.findByRole('listitem', { name: 'bob@example.com' })
    ).toHaveTextContent('Invitation sent')
    expect(boardsApi.invite).toHaveBeenCalledWith(
      board.id,
      'bob@example.com',
      'viewer'
    )
  })

  it('invites several people at once, each a chip', async () => {
    const { boardsApi, board, dialog } = await openSharing()

    type(dialog, 'bob@example.com')
    fireEvent.keyDown(field(dialog), { key: 'Enter' })
    expect(
      dialog.getByRole('button', { name: 'bob@example.com' })
    ).toBeVisible()
    type(dialog, 'eve@example.com')
    fireEvent.click(dialog.getByRole('button', { name: 'Share' }))

    expect(
      await dialog.findByRole('listitem', { name: 'eve@example.com' })
    ).toBeVisible()
    expect(boardsApi.invite).toHaveBeenCalledWith(
      board.id,
      'bob@example.com',
      'editor'
    )
    expect(boardsApi.invite).toHaveBeenCalledWith(
      board.id,
      'eve@example.com',
      'editor'
    )
  })

  it('sends nothing until an address is there', async () => {
    const { dialog } = await openSharing()

    expect(dialog.getByRole('button', { name: 'Share' })).toBeDisabled()
    type(dialog, 'bob')
    expect(dialog.getByRole('button', { name: 'Share' })).toBeDisabled()
  })

  it('offers the roles as radios, the one held checked', async () => {
    const { dialog } = await openSharing()

    fireEvent.click(dialog.getByRole('button', { name: 'Role: Editor' }))

    expect(
      screen
        .getAllByRole('menuitemradio')
        .map(item => [item.textContent, item.getAttribute('aria-checked')])
    ).toEqual([
      ['Viewer', 'false'],
      ['Editor', 'true'],
      ['Admin', 'false']
    ])
  })

  it('keeps the keyboard in the Email field after a click on Share', async () => {
    const { dialog } = await openSharing()
    const send = dialog.getByRole('button', { name: 'Share' })

    type(dialog, 'bob@example.com')
    act(() => {
      send.focus()
    })
    fireEvent.click(send)

    expect(
      await dialog.findByRole('listitem', { name: 'bob@example.com' })
    ).toBeVisible()
    expect(field(dialog)).toHaveFocus()
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

    type(dialog, 'love')
    fireEvent.click(await screen.findByRole('option', { name: /Ada Lovelace/ }))

    expect(dialog.getByRole('button', { name: 'Ada Lovelace' })).toBeVisible()
    expect(field(dialog)).toHaveValue('')
    fireEvent.click(dialog.getByRole('button', { name: 'Share' }))
    expect(
      await dialog.findByRole('listitem', { name: 'ada@example.com' })
    ).toBeVisible()
    expect(boardsApi.suggestPeople).toHaveBeenCalledWith(board.id, 'love')
  })

  it('shows the person signed in first, with a role they cannot change here', async () => {
    const { dialog } = await openSharing([bob, me])

    const rows = await dialog.findAllByRole('listitem')
    expect(rows[0]).toHaveAccessibleName('You')
    const you = within(dialog.getByRole('listitem', { name: 'You' }))
    expect(you.getByText('alice@example.com')).toBeVisible()
    expect(you.getByText('Admin')).toBeVisible()
    expect(you.queryByRole('button')).toBeNull()
  })

  it('says no one else has access yet', async () => {
    const { dialog } = await openSharing()

    expect(await dialog.findByText('No one has been added yet')).toBeVisible()
    expect(
      dialog.getByText('People invited to join will be listed here.')
    ).toBeVisible()
  })

  it('changes a member role and removes a member', async () => {
    const { boardsApi, board, dialog } = await openSharing([me, bob])
    const row = within(
      await dialog.findByRole('listitem', { name: 'Bob Durand' })
    )
    expect(row.getByText('bob@example.com')).toBeVisible()

    fireEvent.click(
      row.getByRole('button', { name: 'Role of Bob Durand: Viewer' })
    )
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Editor' }))
    await waitFor(() => {
      expect(boardsApi.setMemberRole).toHaveBeenCalledWith(
        board.id,
        'bob',
        'editor'
      )
    })
    fireEvent.click(row.getByRole('button', { name: 'Remove Bob Durand' }))

    await waitFor(() => {
      expect(dialog.queryByRole('listitem', { name: 'Bob Durand' })).toBeNull()
    })
    expect(boardsApi.removeMember).toHaveBeenCalledWith(board.id, 'bob')
    expect(field(dialog)).toHaveFocus()
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

    expect(eve.getByText('Invitation sent')).toBeVisible()
    fireEvent.click(
      eve.getByRole('button', {
        name: 'Cancel the invite of eve@example.com'
      })
    )

    await waitFor(() => {
      expect(boardsApi.cancelInvite).toHaveBeenCalledWith(board.id, 'inv')
    })
  })

  it('changes the role of an invite by inviting again', async () => {
    const board = aBoard({ name: 'Design' })
    const boardsApi = fakeBoardsApi([board])
    boardsApi.sharings.set(board.id, {
      members: [me],
      invites: [{ id: 'inv', email: 'eve@example.com', role: 'editor' }]
    })
    renderRoute(`/boards/${board.id}`, { boardsApi })
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
    const dialog = within(await screen.findByRole('dialog'))

    fireEvent.click(
      await dialog.findByRole('button', {
        name: 'Role of eve@example.com: Editor'
      })
    )
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Viewer' }))

    await waitFor(() => {
      expect(boardsApi.invite).toHaveBeenCalledWith(
        board.id,
        'eve@example.com',
        'viewer'
      )
    })
    expect(boardsApi.cancelInvite).toHaveBeenCalledWith(board.id, 'inv')
  })

  it('names the dialog after its title only', async () => {
    await openSharing()
    const label = document.getElementById(
      screen.getByRole('dialog').getAttribute('aria-labelledby') ?? ''
    )
    expect(label).toHaveTextContent(/^Share Design$/)
    expect(label?.querySelector('button')).toBeNull()
  })

  it('explains a refusal to leave the project without an admin', async () => {
    const { boardsApi, dialog } = await openSharing([
      me,
      { ...bob, role: 'admin' }
    ])
    boardsApi.setMemberRole.mockRejectedValueOnce(
      new ApiError(409, 'last_admin')
    )

    fireEvent.click(
      await dialog.findByRole('button', { name: 'Role of Bob Durand: Admin' })
    )
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Viewer' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'A project needs at least one admin. Make someone else admin first.'
    )
  })

  it('shows only the outcome of the last action', async () => {
    const { boardsApi, dialog } = await openSharing([me, bob])
    type(dialog, 'eve@example.com')
    fireEvent.click(dialog.getByRole('button', { name: 'Share' }))
    expect(
      await dialog.findByRole('listitem', { name: 'eve@example.com' })
    ).toBeVisible()

    boardsApi.setMemberRole.mockRejectedValueOnce(new ApiError(500, null))
    fireEvent.click(
      await dialog.findByRole('button', { name: 'Role of Bob Durand: Viewer' })
    )
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Editor' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'The change could not be saved.'
    )

    fireEvent.click(
      await dialog.findByRole('button', {
        name: 'Cancel the invite of eve@example.com'
      })
    )
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
      await dialog.findByText(/^People you invite can open this board\. /)
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
        /An invite only works for an account in your own organization\.$/
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
