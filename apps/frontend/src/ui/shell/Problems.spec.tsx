import { screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fakeReporting } from '@/testing/fakeReporting'
import { renderRoute, renderWithProviders } from '@/testing/renderWithProviders'
import { CrashScreen } from '@/ui/shell/Problems'

describe('problem pages', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('says a page does not exist and keeps the app around it', async () => {
    renderRoute('/no-such-page')

    expect(
      await screen.findByRole('list', { name: 'Main menu' })
    ).toBeInTheDocument()
    expect(
      within(await screen.findByRole('status')).getByRole('heading', {
        level: 1,
        name: 'Page not found'
      })
    ).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(
      screen.getByRole('link', { name: 'Back to boards' })
    ).toHaveAttribute('href', '/')
  })

  it('offers a reload when a screen breaks', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const Broken = () => {
      throw new Error('boom')
    }
    const router = createMemoryRouter([
      { path: '/', element: <Broken />, errorElement: <CrashScreen /> }
    ])
    renderWithProviders(<RouterProvider router={router} />)

    expect(
      within(await screen.findByRole('alert')).getByRole('heading', {
        level: 1,
        name: 'Something went wrong'
      })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible()
  })

  it('reports the error that broke a screen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new Error('boom')
    const Broken = () => {
      throw error
    }
    const reporting = fakeReporting()
    const router = createMemoryRouter([
      { path: '/', element: <Broken />, errorElement: <CrashScreen /> }
    ])
    renderWithProviders(<RouterProvider router={router} />, { reporting })

    await screen.findByRole('alert')

    expect(reporting.reportCrash).toHaveBeenCalledWith(error, null)
  })
})
