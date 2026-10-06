import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

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
  it('lists the tasks matching a search, linked to their board', async () => {
    const { design, boardsApi } = boards()
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
    expect(results.getByRole('link', { name: /New logo/ })).toHaveAttribute(
      'href',
      `/boards/${design.id}?task=DES-1`
    )
    expect(screen.queryByText('Poster')).not.toBeInTheDocument()
    expect(boardsApi.search).toHaveBeenCalledWith('logo')
  })

  it('highlights the part of each title that matches, inside a word too', async () => {
    renderRoute('/search?q=LOG', { boardsApi: boards().boardsApi })

    const link = await screen.findByRole('link', { name: /New logo/ })
    expect(
      [...link.querySelectorAll('mark')].map(mark => mark.textContent)
    ).toEqual(['log'])
  })

  it('quotes the matching part of the description, highlighted', async () => {
    const { design, boardsApi } = boards()
    boardsApi.search.mockResolvedValue([
      {
        ...aTask(null, { key: 'DES-2', title: 'Poster' }),
        boardId: design.id,
        boardName: design.name,
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

    fireEvent.click(screen.getByRole('link', { name: 'Twake Tasks' }))

    await waitFor(() => {
      expect(field).toHaveValue('')
    })
  })

  it('says when nothing matches', async () => {
    renderRoute('/search?q=zebra', { boardsApi: boards().boardsApi })

    expect(await findEmptyState('No tasks match')).toHaveTextContent(
      'Try another word, or check the spelling.'
    )
  })
})
