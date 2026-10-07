import type { TwakeBarProps } from '@linagora/twake-bar'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'
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
    'shows the platform bar, with the search and quick add, and signs out from it on %s',
    async path => {
      const session = fakeSession(() => Promise.resolve(fakeUser('id-token')))
      const board = { ...aBoard(), id: 'board-1' }
      renderRoute(path, { session, boardsApi: fakeBoardsApi([board]) })

      const bar = within(await screen.findByRole('banner'))
      expect(bar.getByText('Twake Project')).toBeInTheDocument()
      expect(bar.getByRole('searchbox', { name: 'Search' })).toBeInTheDocument()
      expect(bar.getByRole('button', { name: 'Quick add' })).toBeInTheDocument()
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

    const nav = within(await screen.findByRole('navigation'))
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

  it('counts unread notifications until they are opened', async () => {
    const boardsApi = fakeBoardsApi()
    boardsApi.notifications.push({
      id: 'n1',
      reason: 'assigned',
      boardId: 'board-1',
      taskId: 'task-1',
      key: 'DES-1',
      title: 'Logo',
      createdAt: '2026-10-05T10:00:00Z',
      readAt: null
    })
    renderRoute('/today', { boardsApi })

    const nav = within(await screen.findByRole('navigation'))
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
