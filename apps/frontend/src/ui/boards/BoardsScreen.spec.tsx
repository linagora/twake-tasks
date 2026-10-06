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
  it('lists active boards, and archived ones under their own tab', async () => {
    const project = aProject({ name: 'Product' })
    const boardsApi = fakeBoardsApi([
      aBoard({ name: 'Design', project }),
      aBoard({ name: 'Front UI', keyPrefix: 'FUI', project }),
      aBoard({ name: 'Old plans', keyPrefix: 'OLD', archived: true, project })
    ])
    renderRoute('/', { boardsApi })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Boards' })
    ).toBeInTheDocument()
    expect(
      boardNames(await screen.findByRole('list', { name: 'Product' }))
    ).toEqual(['Design', 'Front UI'])

    fireEvent.click(screen.getByRole('tab', { name: 'Archived' }))

    expect(boardNames(screen.getByRole('list', { name: 'Product' }))).toEqual([
      'Old plans'
    ])
  })

  it('groups boards under their project, the personal one first', async () => {
    const personal = aProject({ name: 'Personal', personal: true })
    const acme = aProject({ name: 'Acme', managed: true })
    const marketing = aProject({ name: 'Marketing' })
    renderRoute('/', {
      boardsApi: fakeBoardsApi([
        aBoard({
          name: 'Inbox',
          keyPrefix: 'INB',
          inbox: true,
          project: personal
        }),
        aBoard({ name: 'Launch', keyPrefix: 'LAU', project: marketing }),
        aBoard({ name: 'Ops', keyPrefix: 'OPS', project: acme })
      ])
    })

    await screen.findByRole('list', { name: 'Personal' })
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map(heading => heading.textContent)
    ).toEqual(['Personal', 'Acme', 'Marketing'])
    expect(boardNames(screen.getByRole('list', { name: 'Personal' }))).toEqual([
      'Inbox'
    ])
    expect(screen.getAllByText('Members come from the space.')).toHaveLength(1)
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
    renderRoute('/', { boardsApi: fakeBoardsApi([design, ops]) })

    const designCard = within(
      await screen.findByRole('listitem', { name: 'Design' })
    )
    const opsCard = within(screen.getByRole('listitem', { name: 'Ops' }))

    expect(designCard.getByText('DES')).toBeVisible()
    expect(designCard.getByText('2 open tasks')).toBeVisible()
    expect(
      designCard.getByRole('img', { name: 'Personal board' })
    ).toBeVisible()
    expect(opsCard.getByText('No open tasks')).toBeVisible()
    expect(opsCard.getByRole('img', { name: 'Space board' })).toBeVisible()
  })

  it('pins a starred board above the projects until it is unstarred', async () => {
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
    const home = within(screen.getByRole('main'))

    expect(
      home
        .getAllByRole('heading', { level: 2 })
        .map(heading => heading.textContent)
    ).toEqual(['Favorites', 'Product'])
    expect(boardNames(home.getByRole('list', { name: 'Favorites' }))).toEqual([
      'Front UI'
    ])
    expect(home.getByRole('listitem', { name: 'Front UI' })).toHaveTextContent(
      'Product · No open tasks'
    )
    expect(boardNames(home.getByRole('list', { name: 'Product' }))).toEqual([
      'Design'
    ])
    fireEvent.click(unstar)
    expect(
      await screen.findByRole('button', { name: 'Add Front UI to favorites' })
    ).toBeInTheDocument()
    expect(
      home.queryByRole('list', { name: 'Favorites' })
    ).not.toBeInTheDocument()
    expect(boardNames(screen.getByRole('list', { name: 'Product' }))).toEqual([
      'Design',
      'Front UI'
    ])
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

    fireEvent.click(await screen.findByRole('button', { name: 'New' }))
    const dialog = screen.getByRole('dialog', { name: 'New board' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Design' }
    })
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
      keyPrefix: 'DES'
    })
    expect(router.state.location.pathname).toMatch(/^\/boards\//)
  })

  it('suggests a key prefix from the name until one is typed', async () => {
    const boardsApi = fakeBoardsApi()
    renderRoute('/', { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'New' }))
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
        keyPrefix: 'MKT'
      })
    })
  })

  it('says when the key prefix is taken', async () => {
    const boardsApi = fakeBoardsApi([aBoard({ keyPrefix: 'DES' })])
    renderRoute('/', { boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: 'New' }))
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

    fireEvent.click(await screen.findByRole('button', { name: 'New' }))
    const dialog = screen.getByRole('dialog', { name: 'New board' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
      target: { value: '   ' }
    })

    expect(
      within(dialog).getByRole('button', { name: 'Create' })
    ).toBeDisabled()
  })
})
