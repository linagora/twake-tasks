import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aBoard, fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { fakeSession } from '@/testing/fakeSession'
import { renderRoute } from '@/testing/renderWithProviders'

describe('AppShell', () => {
  it.each(['/', '/boards/board-1'])(
    'names the signed-in user and signs out from %s',
    async path => {
      const session = fakeSession()
      const board = { ...aBoard(), id: 'board-1' }
      renderRoute(path, { session, boardsApi: fakeBoardsApi([board]) })

      const header = within(await screen.findByRole('banner'))
      expect(header.getByText('Alice Martin')).toBeInTheDocument()
      fireEvent.click(header.getByRole('button', { name: 'Sign out' }))

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

  it('follows the UI language in the header, page language and title', async () => {
    renderRoute('/', { lang: 'fr' })

    expect(
      within(await screen.findByRole('banner')).getByRole('button', {
        name: 'Se déconnecter'
      })
    ).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('fr')
    await waitFor(() => {
      expect(document.title).toBe('Tableaux - Twake Tasks')
    })
  })
})
