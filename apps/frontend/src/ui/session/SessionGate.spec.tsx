import { act, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { fakeSession } from '@/testing/fakeSession'
import { renderWithProviders } from '@/testing/renderWithProviders'

describe('SessionGate', () => {
  it('waits for the sign-in before showing the app', async () => {
    let finish: (value: null) => void = () => undefined
    const session = fakeSession(
      () =>
        new Promise(resolve => {
          finish = resolve
        })
    )
    renderWithProviders(<p>app</p>, { session })

    expect(
      screen.getByRole('progressbar', { name: 'Signing in…' })
    ).toBeInTheDocument()
    await act(async () => {
      finish(null)
      await Promise.resolve()
    })
    expect(screen.queryByText('app')).not.toBeInTheDocument()
  })

  it('shows the app once signed in, starting the sign-in once', async () => {
    const session = fakeSession()
    renderWithProviders(<p>app</p>, { session })

    expect(await screen.findByText('app')).toBeInTheDocument()
    expect(session.start).toHaveBeenCalledTimes(1)
  })

  it('offers to sign in again when the sign-in fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const session = fakeSession(() => Promise.reject(new Error('bad state')))
    renderWithProviders(<p>app</p>, { session })

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(screen.getByText('Sign-in failed.')).toBeInTheDocument()
    expect(session.signIn).toHaveBeenCalled()
  })

  it('signs in again when another tab signs out', async () => {
    const session = fakeSession()
    renderWithProviders(<p>app</p>, { session })
    await screen.findByText('app')

    session.endElsewhere()

    expect(session.signIn).toHaveBeenCalled()
  })
})
