import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { fakeSession } from '@/testing/fakeSession'
import { renderRoute } from '@/testing/renderWithProviders'

describe('AppShell', () => {
  it.each(['/', '/boards/board-1'])(
    'names the signed-in user and signs out from the account menu on %s',
    async path => {
      const session = fakeSession()
      const board = { ...aBoard(), id: 'board-1' }
      renderRoute(path, { session, boardsApi: fakeBoardsApi([board]) })

      const header = within(await screen.findByRole('banner'))
      fireEvent.click(header.getByRole('button', { name: 'Alice Martin' }))
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))

      expect(session.signOut).toHaveBeenCalled()
    }
  )

  it('links the app name to the boards', async () => {
    renderRoute('/boards/board-1', { boardsApi: fakeBoardsApi() })

    expect(
      within(await screen.findByRole('banner')).getByRole('link', {
        name: 'Twake Tasks'
      })
    ).toHaveAttribute('href', '/')
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
      expect(document.title).toBe('Tableaux - Twake Tasks')
    })
  })
})
