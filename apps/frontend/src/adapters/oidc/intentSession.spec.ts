// The sign-in of `/intents`: silent (prompt=none), in a hidden frame, back on
// its own redirect URI, `/intents/callback`, which another app may frame.
import * as client from 'openid-client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { embedSession } from '@/adapters/oidc/embedSession'
import { intentSsoConfig, readSsoConfig } from '@/adapters/oidc/oidcSession'
import { SILENT_NAME } from '@/adapters/oidc/ssoFrame'

vi.mock('@linagora/twake-oidc', () => ({
  addAuthorization: vi.fn(),
  configureAuth: vi.fn(),
  setTokenSet: vi.fn(),
  logOut: vi.fn(),
  onSessionEndedElsewhere: vi.fn()
}))

vi.mock('openid-client', () => ({
  discovery: vi.fn(() => Promise.resolve({})),
  randomPKCECodeVerifier: vi.fn(() => 'verifier'),
  randomState: vi.fn(() => 'state'),
  calculatePKCECodeChallenge: vi.fn(() => Promise.resolve('challenge')),
  buildAuthorizationUrl: vi.fn(
    (_config: unknown, params: Record<string, string>) =>
      new URL(`https://sso.test/authorize?${new URLSearchParams(params)}`)
  ),
  authorizationCodeGrant: vi.fn(),
  fetchUserInfo: vi.fn()
}))

const app = readSsoConfig(
  {
    SSO_BASE_URL: 'https://sso.test/',
    SSO_CLIENT_ID: 'twaketasks',
    SSO_SCOPE: 'openid email profile',
    SSO_REDIRECT_URI: 'https://tasks.test/auth/callback',
    SSO_POST_LOGOUT_REDIRECT: 'https://tasks.test/'
  },
  'https://tasks.test'
)

afterEach(() => {
  document.body.replaceChildren()
})

describe('the sign-in of the intents page', () => {
  it('comes back on /intents/callback, with the client of the app', () => {
    expect(intentSsoConfig(app)).toEqual({
      ...app,
      redirectUri: 'https://tasks.test/intents/callback'
    })
  })

  it('asks the SSO without showing anything, in a hidden frame', async () => {
    const open = vi.spyOn(window, 'open')
    const started = embedSession(intentSsoConfig(app)).start()
    started.catch(() => undefined)

    const frame = await vi.waitFor(() => {
      const found = document.querySelector<HTMLIFrameElement>(
        `iframe[name="${SILENT_NAME}"]`
      )
      if (!found) throw new Error('no silent frame')
      return found
    })

    const url = new URL(frame.src)
    expect(url.searchParams.get('prompt')).toBe('none')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://tasks.test/intents/callback'
    )
    expect(frame.hidden).toBe(true)
    expect(open).not.toHaveBeenCalled()
    expect(client.buildAuthorizationUrl).toHaveBeenCalledTimes(1)
  })
})
