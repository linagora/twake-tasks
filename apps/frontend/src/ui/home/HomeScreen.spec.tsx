import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { fakeSession } from '@/testing/fakeSession'
import { renderWithProviders } from '@/testing/renderWithProviders'
import { HomeScreen } from '@/ui/home/HomeScreen'

describe('HomeScreen', () => {
  it('shows the app name as the main heading and page title', async () => {
    renderWithProviders(<HomeScreen />)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Twake Tasks' })
    ).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    await waitFor(() => {
      expect(document.title).toBe('Twake Tasks')
    })
  })

  it('follows the UI language', async () => {
    renderWithProviders(<HomeScreen />, { lang: 'fr' })

    expect(await screen.findByRole('main')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('fr')
  })

  it('names the signed-in user and signs out', async () => {
    const session = fakeSession()
    renderWithProviders(<HomeScreen />, { session })

    expect(
      await screen.findByText('Signed in as Alice Martin')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(session.signOut).toHaveBeenCalled()
  })
})
