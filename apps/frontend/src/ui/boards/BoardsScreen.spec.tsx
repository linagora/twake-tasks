import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, aProject, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { findEmptyState } from '@/testing/emptyState'
import { renderRoute } from '@/testing/renderWithProviders'

const boardNames = (list: HTMLElement) =>
  within(list)
    .getAllByRole('link')
    .map(link => link.textContent)

describe('BoardsScreen', () => {
  it('titles the page with its breadcrumb, with no title repeating it', async () => {
    renderRoute('/', { boardsApi: fakeBoardsApi() })

    const crumbs = within(
      await screen.findByRole('navigation', { name: 'Where the page is' })
    )
    expect(
      crumbs.getByRole('heading', { level: 1, name: 'Boards' })
    ).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('lists the active boards, and the archived ones in Archives', async () => {
    const project = aProject({ name: 'Product' })
    const boardsApi = fakeBoardsApi([
      aBoard({ name: 'Design', project }),
      aBoard({ name: 'Front UI', keyPrefix: 'FUI', project }),
      aBoard({ name: 'Old plans', keyPrefix: 'OLD', archived: true, project })
    ])
    const { router } = renderRoute('/', { boardsApi })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Boards' })
    ).toBeInTheDocument()
    expect(
      boardNames(await screen.findByRole('list', { name: 'Boards' }))
    ).toEqual(['Design', 'Front UI'])
    expect(screen.queryByRole('tab')).toBeNull()

    fireEvent.click(
      within(screen.getByRole('list', { name: 'Archived boards' })).getByRole(
        'link',
        {
          name: 'Archives'
        }
      )
    )

    expect(router.state.location.pathname).toBe('/archives')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Archives' })
    ).toBeInTheDocument()
    const archived = screen.getByRole('list', { name: 'Archives' })
    expect(boardNames(archived)).toEqual(['Old plans'])
    expect(
      within(archived).queryByRole('button', { name: /^Create a board/ })
    ).toBeNull()
    expect(
      screen.getByText('Boards you archive stay here, read only.')
    ).toBeVisible()
  })

  it('unarchives an admin board from Archives, which offers to open it', async () => {
    const old = aBoard({ name: 'Old plans', keyPrefix: 'OLD', archived: true })
    const boardsApi = fakeBoardsApi([
      old,
      aBoard({
        name: 'Shared',
        keyPrefix: 'SHA',
        archived: true,
        role: 'editor'
      })
    ])
    const { router } = renderRoute('/archives', { boardsApi })

    const archived = await screen.findByRole('list', { name: 'Archives' })
    expect(
      within(
        within(archived).getByRole('listitem', { name: 'Shared' })
      ).queryByRole('button', { name: 'Unarchive' })
    ).toBeNull()
    fireEvent.click(
      within(
        within(archived).getByRole('listitem', { name: 'Old plans' })
      ).getByRole('button', { name: 'Unarchive' })
    )

    await waitFor(() => {
      expect(boardNames(archived)).toEqual(['Shared'])
    })
    expect(boardsApi.setBoardArchived).toHaveBeenCalledWith(old.id, false)
    fireEvent.click(
      within(
        await screen.findByRole('status', {
          name: '“Old plans” is back in Boards'
        })
      ).getByRole('button', { name: 'Open' })
    )
    expect(router.state.location.pathname).toBe(`/boards/${old.id}`)
  })

  it('lists every board together, the personal ones first, marking those of a space', async () => {
    const personal = aProject({ name: 'Personal', personal: true })
    const acme = aProject({ name: 'Acme', managed: true })
    const marketing = aProject({ name: 'Marketing' })
    renderRoute('/', {
      boardsApi: fakeBoardsApi([
        aBoard({ name: 'Ops', keyPrefix: 'OPS', project: acme }),
        aBoard({ name: 'Launch', keyPrefix: 'LAU', project: marketing }),
        aBoard({
          name: 'Inbox',
          keyPrefix: 'INB',
          inbox: true,
          project: personal
        })
      ])
    })

    const list = await screen.findByRole('list', { name: 'Boards' })
    expect(boardNames(list)).toEqual(['Inbox', 'Launch', 'Ops'])
    fireEvent.mouseOver(
      within(screen.getByRole('listitem', { name: 'Inbox' })).getByText(
        'Default'
      )
    )
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'New tasks are created here by default. This board can’t be shared.'
    )
    // Only a personal board or one of a space says where it belongs.
    expect(
      screen.getByRole('listitem', { name: 'Launch' })
    ).not.toHaveTextContent('Marketing')
    fireEvent.mouseOver(
      within(screen.getByRole('listitem', { name: 'Ops' })).getByText('Space')
    )
    expect(
      await screen.findByRole('tooltip', {
        name: 'Linked to the space “Acme”.'
      })
    ).toBeVisible()
  })

  it('shows the members of each board, and its space', async () => {
    const person = (name: string) => ({
      userId: name,
      email: `${name.toLowerCase()}@example.com`,
      name
    })
    renderRoute('/', {
      boardsApi: fakeBoardsApi([
        aBoard({
          name: 'Ops',
          keyPrefix: 'OPS',
          project: aProject({ name: 'Acme', managed: true }),
          members: ['Alice', 'Bob', 'Carol', 'Dave', 'Erin'].map(person)
        }),
        aBoard({
          name: 'Launch',
          keyPrefix: 'LAU',
          project: aProject({ name: 'Marketing' }),
          members: [person('Alice')]
        })
      ])
    })

    const ops = within(await screen.findByRole('listitem', { name: 'Ops' }))
    const launch = within(screen.getByRole('listitem', { name: 'Launch' }))
    expect(ops.getByText('Space')).toBeVisible()
    // Three people, then the others counted, as in Twake Drive's list.
    const opsPeople = ops.getByRole('img', { name: '5 members' })
    expect(opsPeople).toHaveTextContent(/\+2$/)
    fireEvent.mouseOver(opsPeople)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('5 members')
    expect(launch.queryByText('Marketing')).toBeNull()
    expect(launch.getByRole('img', { name: '1 member' })).toBeVisible()
  })

  it('offers to create the first board', async () => {
    renderRoute('/', { boardsApi: fakeBoardsApi() })

    const empty = await findEmptyState('No boards yet')
    expect(empty).toHaveTextContent(
      'Create a board to plan work with your team.'
    )
    fireEvent.click(
      within(empty).getByRole('button', { name: 'Create a board' })
    )

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('shows placeholders while the boards load', async () => {
    const boardsApi = fakeBoardsApi()
    boardsApi.listBoards.mockReturnValue(new Promise(() => undefined))
    renderRoute('/', { boardsApi })

    expect(
      await screen.findByRole('progressbar', { name: 'Loading' })
    ).toBeInTheDocument()
  })

  it('shows the key, the kind and the open tasks of each board', async () => {
    const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
    design.tasks = [
      aTask(null, { key: 'DES-1', title: 'Logo' }),
      aTask(null, { key: 'DES-2', title: 'Poster' }),
      aTask(null, {
        key: 'DES-3',
        title: 'Flyer',
        completedAt: '2026-10-01T00:00:00Z'
      })
    ]
    const ops = aBoard({
      name: 'Ops',
      keyPrefix: 'OPS',
      project: aProject({ managed: true })
    })
    const inbox = aBoard({
      name: 'Inbox',
      keyPrefix: 'ME',
      inbox: true,
      project: aProject({ personal: true })
    })
    renderRoute('/', { boardsApi: fakeBoardsApi([design, ops, inbox]) })

    const designCard = within(
      await screen.findByRole('listitem', { name: 'Design' })
    )
    const opsCard = within(screen.getByRole('listitem', { name: 'Ops' }))
    const inboxCard = within(screen.getByRole('listitem', { name: 'Inbox' }))

    expect(designCard.getByText('DES')).toBeVisible()
    expect(designCard.getByText('2 open tasks')).toBeVisible()
    expect(
      designCard.getByRole('img', { name: 'Project board' })
    ).toHaveTextContent('D')
    expect(
      inboxCard.getByRole('img', { name: 'Personal board' })
    ).toHaveTextContent('I')
    expect(opsCard.getByText('No open tasks')).toBeVisible()
    expect(opsCard.getByRole('img', { name: 'Space board' })).toHaveTextContent(
      'O'
    )
  })

  it('puts a starred board first, after the create card, until it is unstarred', async () => {
    const project = aProject({ name: 'Product' })
    const boardsApi = fakeBoardsApi([
      aBoard({ name: 'Design', project }),
      aBoard({ name: 'Front UI', keyPrefix: 'FUI', project })
    ])
    renderRoute('/', { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Add Front UI to favorites' })
    )
    const unstar = await screen.findByRole('button', {
      name: 'Remove Front UI from favorites'
    })
    const list = screen.getByRole('list', { name: 'Boards' })

    expect(
      within(screen.getByRole('main')).queryByRole('heading', { level: 2 })
    ).toBeNull()
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent(
      /^Create a board/
    )
    expect(boardNames(list)).toEqual(['Front UI', 'Design'])
    fireEvent.click(unstar)
    expect(
      await screen.findByRole('button', { name: 'Add Front UI to favorites' })
    ).toBeInTheDocument()
    expect(boardNames(screen.getByRole('list', { name: 'Boards' }))).toEqual([
      'Design',
      'Front UI'
    ])
  })

  it('shows the whole name of a board when hovered', async () => {
    const name = 'ux-audit-6 Website relaunch, content and design'
    renderRoute('/', { boardsApi: fakeBoardsApi([aBoard({ name })]) })

    fireEvent.mouseOver(await screen.findByRole('link', { name }))

    expect(await screen.findByRole('tooltip')).toHaveTextContent(name)
  })

  it('marks a board shared with the person until they open it', async () => {
    const design = aBoard({ name: 'Design' })
    const boardsApi = fakeBoardsApi([design])
    boardsApi.shares.set(design.id, {
      sharedBy: { name: 'Alice Martin', email: 'alice@example.com' },
      joinedAt: new Date(Date.now() - 60_000).toISOString()
    })
    const { router } = renderRoute('/', { boardsApi })

    const card = await screen.findByRole('listitem', { name: 'Design' })
    expect(within(card).getByText('New')).toBeVisible()
    expect(card).toHaveTextContent('Shared by Alice Martin')
    expect(card).not.toHaveTextContent('No open tasks')

    fireEvent.click(within(card).getByRole('link', { name: 'Design' }))
    await screen.findByRole('heading', { level: 1, name: 'Design' })
    await router.navigate('/')

    const seen = await screen.findByRole('listitem', { name: 'Design' })
    expect(seen).toHaveTextContent('No open tasks')
    expect(within(seen).queryByText('New')).not.toBeInTheDocument()
  })

  it('stops marking a shared board a week after the person joined', async () => {
    const design = aBoard({ name: 'Design' })
    const boardsApi = fakeBoardsApi([design])
    boardsApi.shares.set(design.id, {
      sharedBy: { name: null, email: 'alice@example.com' },
      joinedAt: new Date(Date.now() - 8 * 24 * 3600_000).toISOString()
    })
    renderRoute('/', { boardsApi })

    const card = await screen.findByRole('listitem', { name: 'Design' })

    expect(card).toHaveTextContent('No open tasks')
    expect(within(card).queryByText('New')).not.toBeInTheDocument()
  })

  it('names the inviter by email when they have no name', async () => {
    const design = aBoard({ name: 'Design' })
    const boardsApi = fakeBoardsApi([design])
    boardsApi.shares.set(design.id, {
      sharedBy: { name: null, email: 'alice@example.com' },
      joinedAt: new Date().toISOString()
    })
    renderRoute('/', { boardsApi })

    expect(
      await screen.findByRole('listitem', { name: 'Design' })
    ).toHaveTextContent('Shared by alice@example.com')
  })

  it('opens a board from the list', async () => {
    const design = aBoard({ name: 'Design' })
    const { router } = renderRoute('/', {
      boardsApi: fakeBoardsApi([design])
    })

    fireEvent.click(await screen.findByRole('link', { name: 'Design' }))

    expect(router.state.location.pathname).toBe(`/boards/${design.id}`)
  })

  it('creates a board and opens it', async () => {
    const boardsApi = fakeBoardsApi()
    const { router } = renderRoute('/', { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: /^Create a board/ })
    )
    const dialog = screen.getByRole('dialog', { name: 'New board' })
    const name = within(dialog).getByRole('textbox', { name: 'Name' })
    expect(name).toHaveFocus()
    fireEvent.change(name, { target: { value: 'Design' } })
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: 'Key prefix' }),
      { target: { value: 'des' } }
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Design' })
    ).toBeInTheDocument()
    expect(boardsApi.createBoard).toHaveBeenCalledWith({
      name: 'Design',
      keyPrefix: 'DES',
      language: 'en'
    })
    expect(router.state.location.pathname).toMatch(/^\/boards\//)
  })

  it('creates a board in the language of the interface', async () => {
    const boardsApi = fakeBoardsApi()
    renderRoute('/', { boardsApi, lang: 'fr' })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Créer un tableau' })
    )
    const dialog = screen.getByRole('dialog', { name: 'Nouveau tableau' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nom' }), {
      target: { value: 'Équipe' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }))

    await waitFor(() => {
      expect(boardsApi.createBoard).toHaveBeenCalledWith({
        name: 'Équipe',
        keyPrefix: 'EQU',
        language: 'fr'
      })
    })
  })

  it('suggests a key prefix from the name until one is typed', async () => {
    const boardsApi = fakeBoardsApi()
    renderRoute('/', { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: /^Create a board/ })
    )
    const dialog = screen.getByRole('dialog', { name: 'New board' })
    const prefix = within(dialog).getByRole('textbox', { name: 'Key prefix' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Équipe marketing' }
    })
    expect(prefix).toHaveValue('EQU')

    fireEvent.change(prefix, { target: { value: 'mkt' } })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Marketing' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(boardsApi.createBoard).toHaveBeenCalledWith({
        name: 'Marketing',
        keyPrefix: 'MKT',
        language: 'en'
      })
    })
  })

  it('says when the key prefix is taken', async () => {
    const boardsApi = fakeBoardsApi([aBoard({ keyPrefix: 'DES' })])
    renderRoute('/', { boardsApi })

    fireEvent.click(
      await screen.findByRole('button', { name: /^Create a board/ })
    )
    const dialog = screen.getByRole('dialog', { name: 'New board' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Desk' }
    })
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: 'Key prefix' }),
      { target: { value: 'DES' } }
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    expect(
      await within(dialog).findByText('Another board already uses DES.')
    ).toBeInTheDocument()

    fireEvent.change(
      within(dialog).getByRole('textbox', { name: 'Key prefix' }),
      { target: { value: 'DSK' } }
    )

    expect(within(dialog).queryByText(/already uses/)).not.toBeInTheDocument()
  })

  it('keeps Create disabled until the name has a character', async () => {
    renderRoute('/')

    fireEvent.click(
      await screen.findByRole('button', { name: /^Create a board/ })
    )
    const dialog = screen.getByRole('dialog', { name: 'New board' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
      target: { value: '   ' }
    })

    expect(
      within(dialog).getByRole('button', { name: 'Create' })
    ).toBeDisabled()
  })
})
