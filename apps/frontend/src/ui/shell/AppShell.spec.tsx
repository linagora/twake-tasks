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
    fireEvent.keyDown(document.body, { key: 't' })

    expect(await screen.findByRole('heading', { name: 'Today' })).toBeVisible()
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

  it('lists the views in the sidebar and marks the current one', async () => {
    renderRoute('/upcoming')

    const nav = within(await screen.findByRole('list', { name: 'Main menu' }))
    expect(
      nav.getAllByRole('link').map(link => link.getAttribute('href'))
    ).toEqual([
      '/',
      '/today',
      '/upcoming',
      '/mine',
      '/notifications',
      '/filters'
    ])
    expect(nav.getByRole('link', { name: 'Upcoming' })).toHaveAttribute(
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

    fireEvent.click(nav.getByRole('link', { name: 'Today' }))
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
      '/today',
      '/upcoming',
      '/mine',
      '/notifications',
      '/filters'
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

  it('lists the favourite filters under Filters, lit while open, until folded', async () => {
    const boardsApi = fakeBoardsApi()
    const { id } = await boardsApi.createFilter({
      name: 'Urgent',
      criteria: { priority: [1] }
    })
    await boardsApi.createFilter({ name: 'Everything', criteria: {} })
    await boardsApi.setFilterFavorite(id, true)
    const first = renderRoute(`/filters/${id}`, { boardsApi })

    const nav = within(await screen.findByRole('list', { name: 'Main menu' }))
    const pinned = await nav.findByRole('link', { name: 'Urgent' })
    expect(pinned).toHaveAttribute('href', `/filters/${id}`)
    expect(pinned).toHaveAttribute('aria-current', 'page')
    const filters = nav.getByRole('link', { name: 'Filters' })
    expect(filters).not.toHaveAttribute('aria-current')
    expect(nav.queryByRole('link', { name: 'Everything' })).toBeNull()

    fireEvent.click(nav.getByRole('button', { name: 'Fold filters' }))
    expect(nav.queryByRole('link', { name: 'Urgent' })).toBeNull()
    expect(filters).toHaveAttribute('aria-current', 'page')

    first.unmount()
    renderRoute('/today', { boardsApi })
    const again = within(await screen.findByRole('list', { name: 'Main menu' }))
    fireEvent.click(
      await again.findByRole('button', { name: 'Unfold filters' })
    )
    expect(await again.findByRole('link', { name: 'Urgent' })).toBeVisible()
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
