import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, onTestFinished } from 'vitest'

import { aBoard, aProject, aTask, fakeBoardsApi } from '@/testing/fakeBoardsApi'
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
    expect(
      screen.queryByRole('region', { name: 'Boards' })
    ).not.toBeInTheDocument()
  })

  it('says how many tasks it found', async () => {
    renderRoute('/search?q=logo', { boardsApi: boards().boardsApi })

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('status')
          .map(status => status.textContent)
          .filter(Boolean)
      ).toEqual(['1 task found for “logo”'])
    })
  })

  it('says how many boards it found too', async () => {
    const design = aBoard({ name: 'Design', keyPrefix: 'DES' })
    design.tasks = [
      aTask(null, { key: 'DES-1', title: 'Design review' }),
      aTask(null, { key: 'DES-2', title: 'Design system' })
    ]
    renderRoute('/search?q=design', { boardsApi: fakeBoardsApi([design]) })

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('status')
          .map(status => status.textContent)
          .filter(Boolean)
      ).toEqual(['2 tasks found for “design”. 1 board found'])
    })
  })

  it('lists the active boards whose name matches, ignoring case and accents', async () => {
    const launch = aBoard({
      name: 'Product lâunch',
      keyPrefix: 'PRO',
      project: aProject({ name: 'Marketing', managed: true })
    })
    const archived = aBoard({
      name: 'Old launch',
      keyPrefix: 'OLD',
      archived: true
    })
    renderRoute('/search?q=LAUNCH', {
      boardsApi: fakeBoardsApi([launch, archived])
    })

    const found = within(await screen.findByRole('region', { name: 'Boards' }))
    const row = found.getByRole('listitem', { name: 'Product lâunch' })
    expect(found.getAllByRole('listitem')).toHaveLength(1)
    expect(row).toHaveTextContent('PRO')
    expect(row).toHaveTextContent('Space')
    expect(
      [...row.querySelectorAll('mark')].map(mark => mark.textContent)
    ).toEqual(['lâunch'])
    expect(
      within(row).getByRole('link', { name: 'Product lâunch' })
    ).toHaveAttribute('href', `/boards/${launch.id}`)
  })

  it('matches a board by its key prefix', async () => {
    renderRoute('/search?q=mkt', {
      boardsApi: fakeBoardsApi([
        aBoard({ name: 'Marketing', keyPrefix: 'MKT' }),
        aBoard({ name: 'Other', keyPrefix: 'AMKT' })
      ])
    })

    const found = within(await screen.findByRole('region', { name: 'Boards' }))
    expect(found.getAllByRole('listitem')).toHaveLength(1)
    expect(
      found.getByRole('listitem', { name: 'Marketing' })
    ).toBeInTheDocument()
  })

  it('shows five matching boards, and the others on demand', async () => {
    const many = Array.from({ length: 7 }, (_, index) =>
      aBoard({
        name: `Launch ${String(index + 1)}`,
        keyPrefix: `L${String(index)}`
      })
    )
    renderRoute('/search?q=launch', { boardsApi: fakeBoardsApi(many) })

    const found = within(await screen.findByRole('region', { name: 'Boards' }))
    expect(found.getAllByRole('listitem')).toHaveLength(5)

    fireEvent.click(screen.getByRole('button', { name: 'Show all 7 boards' }))

    expect(found.getAllByRole('listitem')).toHaveLength(7)
    expect(
      screen.queryByRole('button', { name: /Show all/ })
    ).not.toBeInTheDocument()
  })
})

describe('live search results', () => {
  async function type(text: string) {
    const field = await screen.findByRole('combobox', { name: 'Search' })
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: text } })
    return field
  }

  it('lists the boards, then the tasks, that match as one types', async () => {
    const { boardsApi } = boards()
    renderRoute('/', { boardsApi })

    const field = await type('des')
    const list = within(await screen.findByRole('listbox'))

    await waitFor(() => {
      expect(
        list.getAllByRole('option').map(option => option.textContent)
      ).toEqual([
        // The board's name, then its project.
        'DesignDesign',
        'New logoDES-1 · Design',
        'PosterDES-2 · Design'
      ])
    })
    expect(field).toHaveAttribute('aria-expanded', 'true')
    expect(list.getAllByRole('option')[0]).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('opens the task picked with the arrows and Enter, and empties the field', async () => {
    const { boardsApi, design } = boards()
    const { router } = renderRoute('/', { boardsApi })

    const field = await type('logo')
    const option = await screen.findByRole('option', { name: /New logo/ })
    expect(option).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(field, { key: 'ArrowDown' })
    fireEvent.keyDown(field, { key: 'ArrowUp' })
    fireEvent.keyDown(field, { key: 'Enter' })

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/boards/${design.id}`)
    })
    expect(router.state.location.search).toBe('?task=DES-1')
    expect(field).toHaveValue('')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('says when there is nothing, or too little typed', async () => {
    renderRoute('/', { boardsApi: boards().boardsApi })

    const field = await type('d')
    expect(
      await screen.findByText('Type at least 2 characters to search.')
    ).toBeInTheDocument()

    fireEvent.change(field, { target: { value: 'zebra' } })
    expect(await screen.findByText('No results')).toBeInTheDocument()

    fireEvent.keyDown(field, { key: 'Escape' })
    expect(field).toHaveValue('')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
