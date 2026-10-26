import type { TwakeBarProps } from '@linagora/twake-bar'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { aBoard, aNotification, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { fakeSession, fakeUser } from '@/testing/fakeSession'
import { renderRoute } from '@/testing/renderWithProviders'

const createSdk = vi.hoisted(() => vi.fn(() => ({ status: 'ready' })))
vi.mock('@linagora/twake-sdk', () => ({ createSdk }))

// The bar is tested in its own package: only its wiring matters here
vi.mock('@linagora/twake-bar', () => ({
  SdkProvider: ({ children }: { children: ReactNode }): ReactNode => children,
  TwakeBar: ({ app, slots, onLogOut }: TwakeBarProps): ReactElement => (
    <header role="banner">
      {app.name}
      {slots?.search}
      {slots?.right}
      <button onClick={onLogOut}>Log out</button>
    </header>
  )
}))

describe('AppShell', () => {
  beforeEach(() => {
    createSdk.mockClear()
  })

  it.each(['/', '/boards/board-1'])(
    'shows the platform bar with the search, the quick add in the sidebar, and signs out from it on %s',
    async path => {
      const session = fakeSession(() => Promise.resolve(fakeUser('id-token')))
      const board = { ...aBoard(), id: 'board-1' }
      renderRoute(path, { session, boardsApi: fakeBoardsApi([board]) })

      const bar = within(await screen.findByRole('banner'))
      expect(bar.getByText('Twake Project')).toBeInTheDocument()
      expect(bar.getByRole('searchbox', { name: 'Search' })).toBeInTheDocument()
      expect(bar.queryByRole('button', { name: 'Create task' })).toBe(null)
      expect(
        within(screen.getByRole('complementary')).getByRole('button', {
          name: 'Create task'
        })
      ).toBeInTheDocument()
      expect(createSdk).toHaveBeenCalledWith({
        platformURL: 'https://alice.twake.test',
        idToken: 'id-token'
      })
      fireEvent.click(bar.getByRole('button', { name: 'Log out' }))

      expect(session.signOut).toHaveBeenCalled()
    }
  )

  it.each(['/', '/boards/board-1'])(
    'keeps its own header, with the account menu, when the SSO did not name the platform, on %s',
    async path => {
      const session = fakeSession()
      const board = { ...aBoard(), id: 'board-1' }
      renderRoute(path, { session, boardsApi: fakeBoardsApi([board]) })

      const header = within(await screen.findByRole('banner'))
      fireEvent.click(header.getByRole('button', { name: 'Alice Martin' }))
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))

      expect(session.signOut).toHaveBeenCalled()
      expect(createSdk).not.toHaveBeenCalled()
    }
  )

  it('shows the name and picture the person chose in Twake Workplace', async () => {
    const boardsApi = fakeBoardsApi()
    boardsApi.settings.mockResolvedValue({
      language: null,
      timezone: null,
      theme: 'auto',
      avatar: 'https://avatars.test/alice.png',
      name: 'Alice M.'
    })
    renderRoute('/', { boardsApi })

    const account = await within(await screen.findByRole('banner')).findByRole(
      'button',
      { name: 'Alice M.' }
    )

    expect(account.querySelector('img')).toHaveAttribute(
      'src',
      'https://avatars.test/alice.png'
    )
  })

  it('moves focus into the account menu so Escape closes it', async () => {
    renderRoute('/', { boardsApi: fakeBoardsApi() })

    fireEvent.click(
      within(await screen.findByRole('banner')).getByRole('button', {
        name: 'Alice Martin'
      })
    )
    const signOut = await screen.findByRole('menuitem', { name: 'Sign out' })
    await waitFor(() => {
      expect(signOut).toHaveFocus()
    })
    fireEvent.keyDown(signOut, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })

  it('closes the account menu when the page changes', async () => {
    renderRoute('/', { boardsApi: fakeBoardsApi() })
    fireEvent.click(
      within(await screen.findByRole('banner')).getByRole('button', {
        name: 'Alice Martin'
      })
    )
    await screen.findByRole('menu')

    fireEvent.keyDown(document.body, { key: 'g' })
    fireEvent.keyDown(document.body, { key: 'f' })

    expect(await screen.findByRole('heading', { name: 'Views' })).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })

  it('links the app name to the boards', async () => {
    renderRoute('/boards/board-1', { boardsApi: fakeBoardsApi() })

    expect(
      within(await screen.findByRole('banner')).getByRole('link', {
        name: 'Twake Project'
      })
    ).toHaveAttribute('href', '/')
  })

  it('offers a search box in the header', async () => {
    renderRoute('/', { boardsApi: fakeBoardsApi() })

    expect(
      within(await screen.findByRole('banner')).getByRole('searchbox', {
        name: 'Search'
      })
    ).toBeInTheDocument()
  })

  it('lists the pages in the sidebar and marks the current one', async () => {
    renderRoute('/notifications')

    const nav = within(await screen.findByRole('list', { name: 'Main menu' }))
    expect(
      nav.getAllByRole('link').map(link => link.getAttribute('href'))
    ).toEqual(['/', '/filters', '/notifications'])
    expect(nav.getByRole('link', { name: 'Notifications' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(nav.getByRole('link', { name: 'Boards' })).not.toHaveAttribute(
      'aria-current'
    )
  })

  it('lights Archives, not Boards, on an archived board', async () => {
    const old = aBoard({ name: 'Old plans', archived: true })
    renderRoute(`/boards/${old.id}`, { boardsApi: fakeBoardsApi([old]) })

    const archives = within(
      await screen.findByRole('list', { name: 'Archived boards' })
    ).getByRole('link', { name: 'Archives' })
    await waitFor(() => {
      expect(archives).toHaveAttribute('aria-current', 'page')
    })
    expect(
      within(screen.getByRole('list', { name: 'Main menu' })).getByRole(
        'link',
        { name: 'Boards' }
      )
    ).not.toHaveAttribute('aria-current')
  })

  it('lists the favourite boards in the sidebar', async () => {
    const boardsApi = fakeBoardsApi([
      { ...aBoard(), id: 'board-1', name: 'Design' },
      { ...aBoard(), id: 'board-2', name: 'Launch' }
    ])
    await boardsApi.setFavorite('board-2', true)
    renderRoute('/today', { boardsApi })

    const favourites = within(
      await screen.findByRole('list', { name: 'Favorites' })
    )
    expect(
      await favourites.findByRole('link', { name: 'Launch' })
    ).toHaveAttribute('href', '/boards/board-2')
    expect(favourites.queryByRole('link', { name: 'Design' })).toBeNull()
  })

  it('shows Favorites unfolded until folded, and remembers it', async () => {
    const boardsApi = fakeBoardsApi([
      { ...aBoard(), id: 'board-1', name: 'Launch' }
    ])
    await boardsApi.setFavorite('board-1', true)
    const first = renderRoute('/today', { boardsApi })

    const favourites = within(
      await screen.findByRole('list', { name: 'Favorites' })
    )
    expect(
      await favourites.findByRole('link', { name: 'Launch' })
    ).toBeVisible()
    const fold = favourites.getByRole('button', { name: 'Fold Favorites' })
    expect(fold).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(fold)
    expect(favourites.queryByRole('link', { name: 'Launch' })).toBe(null)

    first.unmount()
    renderRoute('/today', { boardsApi })
    const again = within(await screen.findByRole('list', { name: 'Favorites' }))
    fireEvent.click(
      await again.findByRole('button', { name: 'Unfold Favorites' })
    )
    expect(await again.findByRole('link', { name: 'Launch' })).toBeVisible()
  })

  it('lights a board under Boards, or Boards while folded, but for one opened from its favourite', async () => {
    const boardsApi = fakeBoardsApi([
      { ...aBoard(), id: 'board-2', name: 'Launch' }
    ])
    await boardsApi.setFavorite('board-2', true)
    renderRoute('/boards/board-2', { boardsApi })

    const nav = within(await screen.findByRole('list', { name: 'Main menu' }))
    const favourites = within(
      await screen.findByRole('list', { name: 'Favorites' })
    )
    const favourite = await favourites.findByRole('link', { name: 'Launch' })
    const boards = nav.getByRole('link', { name: 'Boards' })
    expect(boards).toHaveAttribute('aria-current', 'page')
    fireEvent.click(nav.getByRole('button', { name: 'Unfold boards' }))
    const listed = await nav.findByRole('link', { name: 'Launch' })
    expect(listed).toHaveAttribute('aria-current', 'page')
    expect(boards).not.toHaveAttribute('aria-current')
    expect(favourite).not.toHaveAttribute('aria-current')

    fireEvent.click(favourite)
    await waitFor(() => {
      expect(favourite).toHaveAttribute('aria-current', 'page')
    })
    expect(listed).not.toHaveAttribute('aria-current')

    fireEvent.click(nav.getByRole('link', { name: 'Notifications' }))
    await waitFor(() => {
      expect(favourite).not.toHaveAttribute('aria-current')
    })
  })

  it('lists the active boards under Boards, by name, and marks the current one', async () => {
    const boardsApi = fakeBoardsApi([
      { ...aBoard(), id: 'board-1', name: 'Launch' },
      { ...aBoard(), id: 'board-2', name: 'Design' },
      { ...aBoard(), id: 'board-3', name: 'Old', archived: true }
    ])
    renderRoute('/boards/board-1', { boardsApi })

    const nav = within(await screen.findByRole('list', { name: 'Main menu' }))
    fireEvent.click(nav.getByRole('button', { name: 'Unfold boards' }))
    expect(await nav.findByRole('link', { name: 'Design' })).toBeVisible()
    expect(
      nav.getAllByRole('link').map(link => link.getAttribute('href'))
    ).toEqual([
      '/',
      '/boards/board-2',
      '/boards/board-1',
      '/filters',
      '/notifications'
    ])
    expect(nav.getByRole('link', { name: 'Launch' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(nav.getByRole('link', { name: 'Boards' })).not.toHaveAttribute(
      'aria-current'
    )
  })

  it('keeps the boards under Boards folded until unfolded, and remembers it', async () => {
    const boardsApi = fakeBoardsApi([{ ...aBoard(), name: 'Design' }])
    const first = renderRoute('/today', { boardsApi })

    const nav = within(await screen.findByRole('list', { name: 'Main menu' }))
    const unfold = await nav.findByRole('button', { name: 'Unfold boards' })
    expect(unfold).toHaveAttribute('aria-expanded', 'false')
    expect(nav.queryByRole('link', { name: 'Design' })).toBe(null)
    fireEvent.click(unfold)
    expect(await nav.findByRole('link', { name: 'Design' })).toBeVisible()

    first.unmount()
    renderRoute('/today', { boardsApi })
    const again = within(await screen.findByRole('list', { name: 'Main menu' }))
    expect(await again.findByRole('link', { name: 'Design' })).toBeVisible()
    fireEvent.click(again.getByRole('button', { name: 'Fold boards' }))
    expect(again.queryByRole('link', { name: 'Design' })).toBe(null)
  })

  it('makes a board from the + beside Boards, then opens it', async () => {
    const boardsApi = fakeBoardsApi()
    renderRoute('/today', { boardsApi })

    const nav = within(await screen.findByRole('list', { name: 'Main menu' }))
    fireEvent.click(nav.getByRole('button', { name: 'Unfold boards' }))
    fireEvent.click(nav.getByRole('button', { name: 'New board' }))
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.change(dialog.getByLabelText(/^Name/), {
      target: { value: 'Roadmap' }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(boardsApi.createBoard).toHaveBeenCalledWith({
      name: 'Roadmap',
      keyPrefix: 'ROA',
      language: 'en'
    })
    await waitFor(() => {
      expect(nav.getByRole('link', { name: 'Roadmap' })).toHaveAttribute(
        'aria-current',
        'page'
      )
    })
  })

  it('lists the views under Views once unfolded, by name, and marks the current one', async () => {
    const boardsApi = fakeBoardsApi()
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: {}
    })
    const other = await boardsApi.createFilter({ name: 'Design', criteria: {} })
    renderRoute(`/filters/${id}`, { boardsApi })

    const nav = within(await screen.findByRole('list', { name: 'Main menu' }))
    const views = nav.getByRole('link', { name: 'Views' })
    expect(views).toHaveAttribute('aria-current', 'page')
    expect(nav.queryByRole('link', { name: 'Urgent' })).toBe(null)
    const unfold = nav.getByRole('button', { name: 'Unfold views' })
    expect(unfold).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(unfold)

    expect(await nav.findByRole('link', { name: 'Urgent' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(
      nav
        .getAllByRole('link')
        .map(link => link.getAttribute('href'))
        .slice(-4, -1)
    ).toEqual(['/filters', `/filters/${other.id}`, `/filters/${id}`])
    expect(views).not.toHaveAttribute('aria-current')
    fireEvent.click(nav.getByRole('button', { name: 'Fold views' }))
    expect(nav.queryByRole('link', { name: 'Urgent' })).toBe(null)
  })

  it('makes the first views, named in my language, before listing them', async () => {
    const boardsApi = fakeBoardsApi()
    renderRoute('/notifications', { boardsApi })

    await screen.findByRole('list', { name: 'Main menu' })
    await waitFor(() => {
      expect(boardsApi.listFilters).toHaveBeenCalled()
    })
    expect(boardsApi.makeDefaultFilters).toHaveBeenCalledTimes(1)
    expect(boardsApi.makeDefaultFilters).toHaveBeenCalledWith({
      today: 'Today',
      upcoming: 'Upcoming',
      mine: 'My tasks'
    })
    expect(
      boardsApi.makeDefaultFilters.mock.invocationCallOrder[0]
    ).toBeLessThan(boardsApi.listFilters.mock.invocationCallOrder[0] ?? 0)
  })

  it('lights a favourite view opened from the favourites, not Views', async () => {
    const boardsApi = fakeBoardsApi()
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: {}
    })
    await boardsApi.setFilterFavorite(id, true)
    renderRoute('/notifications', { boardsApi })

    const nav = within(await screen.findByRole('list', { name: 'Main menu' }))
    const favourites = within(
      await screen.findByRole('list', { name: 'Favorites' })
    )
    const favourite = await favourites.findByRole('link', { name: 'Urgent' })
    fireEvent.click(favourite)

    await waitFor(() => {
      expect(favourite).toHaveAttribute('aria-current', 'page')
    })
    expect(nav.getByRole('link', { name: 'Views' })).not.toHaveAttribute(
      'aria-current'
    )
  })

  it('makes a view from the + beside Views, then opens it', async () => {
    const boardsApi = fakeBoardsApi()
    renderRoute('/today', { boardsApi })

    const nav = within(await screen.findByRole('list', { name: 'Main menu' }))
    fireEvent.click(nav.getByRole('button', { name: 'Create a view' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Create a view' })
    )
    fireEvent.change(dialog.getByLabelText(/^Name/), {
      target: { value: 'Urgent' }
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Create' }))

    expect(await screen.findByRole('heading', { name: 'Urgent' })).toBeVisible()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(boardsApi.createFilter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Urgent' })
    )
  })

  it('moves a board from Favorites to a section of my own and back, one at a time', async () => {
    const board = { ...aBoard(), id: 'board-1', name: 'Design' }
    const boardsApi = fakeBoardsApi([board])
    await boardsApi.createSidebarSection('Work')
    renderRoute('/boards/board-1', { boardsApi })

    const work = within(await screen.findByRole('list', { name: 'Work' }))
    expect(screen.queryByRole('button', { name: 'New sidebar section' })).toBe(
      null
    )
    expect(work.getByText('Drag boards and views here')).toBeInTheDocument()
    fireEvent.click(work.getByRole('button', { name: 'Fold Work' }))
    expect(work.queryByText('Drag boards and views here')).toBe(null)
    fireEvent.click(work.getByRole('button', { name: 'Unfold Work' }))

    fireEvent.click(screen.getByRole('button', { name: 'Board options' }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Show in the sidebar' })
    )
    const where = within(
      await screen.findByRole('menu', { name: 'Show in the sidebar' })
    )
    expect(
      where.getByRole('menuitemradio', { name: 'Favorites' })
    ).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(where.getByRole('menuitemradio', { name: 'Work' }))
    await waitFor(() => {
      expect(work.getByRole('link', { name: 'Design' })).toHaveAttribute(
        'href',
        '/boards/board-1'
      )
    })
    // Starred, but in Work only.
    const favorites = within(screen.getByRole('list', { name: 'Favorites' }))
    expect(favorites.queryByRole('link', { name: 'Design' })).toBeNull()

    // Its entry has no menu: the board's own moves it back.
    expect(work.queryByRole('button', { name: /Design/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Board options' }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Show in the sidebar' })
    )
    const back = within(
      await screen.findByRole('menu', { name: 'Show in the sidebar' })
    )
    expect(back.getByRole('menuitemradio', { name: 'Work' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    fireEvent.click(back.getByRole('menuitemradio', { name: 'Favorites' }))
    await waitFor(() => {
      expect(
        favorites.getByRole('link', { name: 'Design' })
      ).toBeInTheDocument()
    })
    expect(work.queryByRole('link', { name: 'Design' })).toBeNull()

    fireEvent.click(work.getByRole('button', { name: 'Actions of Work' }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete the section' })
    )
    fireEvent.click(
      within(
        await screen.findByRole('dialog', { name: 'Delete Work?' })
      ).getByRole('button', { name: 'Delete' })
    )
    await waitFor(() => {
      expect(screen.queryByRole('list', { name: 'Work' })).toBeNull()
    })
  })

  it('counts unread notifications until they are opened', async () => {
    const boardsApi = fakeBoardsApi()
    boardsApi.notifications.push(aNotification({ reason: 'assigned' }))
    renderRoute('/today', { boardsApi })

    const nav = within(await screen.findByRole('list', { name: 'Main menu' }))
    const link = await nav.findByRole('link', {
      name: 'Notifications, 1 unread'
    })
    expect(boardsApi.markNotificationsRead).not.toHaveBeenCalled()

    fireEvent.click(link)

    expect(
      await nav.findByRole('link', { name: 'Notifications' })
    ).toBeInTheDocument()
  })

  it('follows the UI language in the header, page language and title', async () => {
    renderRoute('/', { lang: 'fr' })

    fireEvent.click(
      within(await screen.findByRole('banner')).getByRole('button', {
        name: 'Alice Martin'
      })
    )
    expect(
      await screen.findByRole('menuitem', { name: 'Se déconnecter' })
    ).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('fr')
    await waitFor(() => {
      expect(document.title).toBe('Tableaux - Twake Project')
    })
  })
})
