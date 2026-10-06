import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { findEmptyState } from '@/testing/emptyState'
import { renderRoute } from '@/testing/renderWithProviders'

describe('BoardsScreen', () => {
  it('lists active boards, and archived ones under their own tab', async () => {
    const boardsApi = fakeBoardsApi([
      aBoard({ name: 'Design' }),
      aBoard({ name: 'Front UI', keyPrefix: 'FUI' }),
      aBoard({ name: 'Old plans', keyPrefix: 'OLD', archived: true })
    ])
    renderRoute('/', { boardsApi })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Boards' })
    ).toBeInTheDocument()
    const active = await screen.findByRole('list', { name: 'Boards' })
    expect(
      within(active)
        .getAllByRole('link')
        .map(link => link.textContent)
    ).toEqual(['Design', 'Front UI'])

    fireEvent.click(screen.getByRole('tab', { name: 'Archived' }))

    expect(
      within(screen.getByRole('list', { name: 'Boards' }))
        .getAllByRole('link')
        .map(link => link.textContent)
    ).toEqual(['Old plans'])
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

  it('pins a starred board first until it is unstarred', async () => {
    const boardsApi = fakeBoardsApi([
      aBoard({ name: 'Design' }),
      aBoard({ name: 'Front UI', keyPrefix: 'FUI' })
    ])
    renderRoute('/', { boardsApi })
    const names = () =>
      within(screen.getByRole('list', { name: 'Boards' }))
        .getAllByRole('link')
        .map(link => link.textContent)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Add Front UI to favorites' })
    )
    const unstar = await screen.findByRole('button', {
      name: 'Remove Front UI from favorites'
    })

    expect(names()).toEqual(['Front UI', 'Design'])
    fireEvent.click(unstar)
    expect(
      await screen.findByRole('button', { name: 'Add Front UI to favorites' })
    ).toBeInTheDocument()
    expect(names()).toEqual(['Design', 'Front UI'])
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
