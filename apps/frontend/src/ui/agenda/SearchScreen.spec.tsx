import { fireEvent, screen, within } from '@testing-library/react'
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
    fireEvent.submit(screen.getByRole('search'))

    const results = within(
      await screen.findByRole('region', { name: 'Results for “logo”' })
    )
    expect(results.getByRole('link', { name: /New logo/ })).toHaveAttribute(
      'href',
      `/boards/${design.id}`
    )
    expect(screen.queryByText('Poster')).not.toBeInTheDocument()
    expect(boardsApi.search).toHaveBeenCalledWith('logo')
  })

  it('says when nothing matches', async () => {
    renderRoute('/search?q=zebra', { boardsApi: boards().boardsApi })

    expect(await findEmptyState('No tasks match')).toHaveTextContent(
      'Try another word, or check the spelling.'
    )
  })
})
