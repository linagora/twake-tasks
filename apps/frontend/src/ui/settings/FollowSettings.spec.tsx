import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UserSettings } from '@/application/boards'
import { fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { renderWithProviders } from '@/testing/renderWithProviders'
import { followZone, localZone } from '@/ui/boards/dueLabel'
import { useI18n } from '@/ui/i18n/useI18n'
import { FollowSettings } from '@/ui/settings/FollowSettings'

const NONE: UserSettings = {
  language: null,
  timezone: null,
  theme: 'auto',
  avatar: null,
  name: null
}

function Probe() {
  const { t } = useI18n()
  return <p>{`${t('session.signingIn')} ${localZone()}`}</p>
}

function renderWith(settings: Partial<UserSettings>, lang: 'en' | 'fr' = 'en') {
  const boardsApi = fakeBoardsApi()
  boardsApi.settings = vi.fn(() => Promise.resolve({ ...NONE, ...settings }))
  return renderWithProviders(
    <FollowSettings>
      <Probe />
    </FollowSettings>,
    { boardsApi, lang }
  )
}

const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone

afterEach(() => {
  followZone(null)
  document.documentElement.removeAttribute('data-theme')
})

describe('FollowSettings', () => {
  it("speaks the person's language", async () => {
    renderWith({ language: 'fr' })

    expect(await screen.findByText(/^Connexion en cours…/)).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('fr')
  })

  it('keeps the browser language without one, or with one it does not speak', async () => {
    renderWith({ language: 'de' }, 'fr')

    expect(await screen.findByText(/^Connexion en cours…/)).toBeInTheDocument()
  })

  it("takes the person's theme", async () => {
    renderWith({ theme: 'dark' })

    await screen.findByText(/Signing you in/)
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    })
  })

  it("counts days in the person's timezone", async () => {
    renderWith({ timezone: 'Pacific/Kiritimati' })

    expect(
      await screen.findByText('Signing you in… Pacific/Kiritimati')
    ).toBeInTheDocument()
  })

  it('keeps the browser timezone without a valid one', async () => {
    renderWith({ timezone: 'Mars/Olympus_Mons' })

    expect(
      await screen.findByText(`Signing you in… ${browserZone}`)
    ).toBeInTheDocument()
  })

  it('follows a change made in Twake Workplace once the person comes back to the tab', async () => {
    const boardsApi = fakeBoardsApi()
    let held: UserSettings = { ...NONE, language: 'fr' }
    boardsApi.settings = vi.fn(() => Promise.resolve(held))
    renderWithProviders(
      <FollowSettings>
        <Probe />
      </FollowSettings>,
      { boardsApi }
    )
    await screen.findByText(/^Connexion en cours…/)

    held = { ...held, language: 'en' }
    window.dispatchEvent(new Event('visibilitychange'))

    expect(
      await screen.findByText(`Signing you in… ${browserZone}`)
    ).toBeInTheDocument()
    expect(boardsApi.settings).toHaveBeenCalledTimes(2)
  })

  it('shows the app with the browser settings when they cannot be read', async () => {
    const boardsApi = fakeBoardsApi()
    boardsApi.settings = vi.fn(() => Promise.reject(new Error('down')))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderWithProviders(
      <FollowSettings>
        <Probe />
      </FollowSettings>,
      { boardsApi }
    )

    expect(
      await screen.findByText(`Signing you in… ${browserZone}`)
    ).toBeInTheDocument()
  })

  it('reads the settings again on coming back to the tab after a failed read', async () => {
    const boardsApi = fakeBoardsApi()
    boardsApi.settings = vi
      .fn<typeof boardsApi.settings>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue({ ...NONE, language: 'fr' })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderWithProviders(
      <FollowSettings>
        <Probe />
      </FollowSettings>,
      { boardsApi }
    )
    await screen.findByText(`Signing you in… ${browserZone}`)

    window.dispatchEvent(new Event('visibilitychange'))

    expect(await screen.findByText(/^Connexion en cours…/)).toBeInTheDocument()
  })
})
