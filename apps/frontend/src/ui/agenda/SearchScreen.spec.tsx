import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, onTestFinished } from 'vitest'

import { aBoard, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { findEmptyState } from '@/testing/emptyState'
import { renderRoute } from '@/testing/renderWithProviders'

function boards() {
  const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
  design.tasks = [
    aTask(null, { key: 'DES-1', title: 'New logo' }),
    aTask(null, { key: 'DES-2', title: 'Poster' })
  ]
  return { design, boardsApi: fakeBoardsApi([design]) }
}

describe('SearchScreen', () => {
  it('lists the tasks matching a search', async () => {
    const { boardsApi } = boards()
    renderRoute('/', { boardsApi })

    fireEvent.change(
      within(await screen.findByRole('search')).getByLabelText('Search'),
      { target: { value: 'logo' } }
    )
    const reloads = fireEvent.submit(screen.getByRole('search'))

    expect(reloads).toBe(false)
    const results = within(
      await screen.findByRole('region', { name: 'Results for “logo”' })
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Search' })
    ).toBeVisible()
    expect(
      results.getByRole('button', { name: /New logo/ })
    ).toBeInTheDocument()
    expect(screen.queryByText('Poster')).not.toBeInTheDocument()
    expect(boardsApi.search).toHaveBeenCalledWith('logo')
  })

  it('opens a result whose breadcrumb goes back to the same search', async () => {
    renderRoute('/search?q=logo', { boardsApi: boards().boardsApi })

    fireEvent.click(await screen.findByRole('button', { name: /New logo/ }))
    const panel = within(
      await screen.findByRole('dialog', { name: /^DES-1 New logo/ })
    )
    fireEvent.click(panel.getByRole('button', { name: 'Open as full page' }))

    expect(
      within(
        panel.getByRole('navigation', { name: 'Where the task is' })
      ).getByRole('link', { name: 'Search' })
    ).toHaveAttribute('href', '/search?q=logo')
  })

  it('highlights the part of each title that matches, inside a word too', async () => {
    renderRoute('/search?q=LOG', { boardsApi: boards().boardsApi })

    const link = await screen.findByRole('button', { name: /New logo/ })
    expect(
      [...link.querySelectorAll('mark')].map(mark => mark.textContent)
    ).toEqual(['log'])
  })

  it('quotes the matching part of the description, highlighted', async () => {
    const { design, boardsApi } = boards()
    boardsApi.search.mockResolvedValue([
      {
        ...aTask(null, { key: 'DES-2', title: 'Poster' }),
        category: null,
        completable: true,
        boardId: design.id,
        boardName: design.name,
        parentTitle: null,
        excerpt: '…for the spring fair in Lyon'
      }
    ])
    renderRoute('/search?q=fair', { boardsApi })

    const row = await screen.findByRole('listitem', { name: /Poster/ })
    expect(row).toHaveTextContent('…for the spring fair in Lyon')
    expect(
      [...row.querySelectorAll('mark')].map(mark => mark.textContent)
    ).toEqual(['fair'])
  })

  it('keeps the searched words in the search field', async () => {
    renderRoute('/search?q=logo', { boardsApi: boards().boardsApi })

    expect(
      within(await screen.findByRole('search')).getByLabelText('Search')
    ).toHaveValue('logo')
  })

  it('empties the search field when leaving the search', async () => {
    renderRoute('/search?q=logo', { boardsApi: boards().boardsApi })
    const field = within(await screen.findByRole('search')).getByLabelText(
      'Search'
    )

    fireEvent.click(screen.getByRole('link', { name: 'Twake Project' }))

    await waitFor(() => {
      expect(field).toHaveValue('')
    })
  })

  it('asks for two characters at least, without searching', async () => {
    const { boardsApi } = boards()
    renderRoute('/search?q=a', { boardsApi })

    expect(
      await screen.findByText('Type at least 2 characters to search.')
    ).toBeVisible()
    expect(boardsApi.search).not.toHaveBeenCalled()
  })

  it('asks for as many characters as the settings say', async () => {
    window.SEARCH_MIN_LENGTH = '3'
    onTestFinished(() => {
      delete window.SEARCH_MIN_LENGTH
    })
    const { boardsApi } = boards()
    renderRoute('/search?q=ab', { boardsApi })

    expect(
      await screen.findByText('Type at least 3 characters to search.')
    ).toBeVisible()
    expect(boardsApi.search).not.toHaveBeenCalled()
  })

  it('says when nothing matches', async () => {
    renderRoute('/search?q=zebra', { boardsApi: boards().boardsApi })

    expect(await findEmptyState('No tasks match')).toHaveTextContent(
      'Try another word, or check the spelling.'
    )
  })
})
