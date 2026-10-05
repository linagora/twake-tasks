import { setTokenSet } from '@linagora/twake-oidc'
import * as client from 'openid-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  embedSession,
  POPUP_NAME,
  signInInPopup
} from '@/adapters/oidc/embedSession'
import { readSsoConfig } from '@/adapters/oidc/oidcSession'
import { fakeSession } from '@/testing/fakeSession'

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
  authorizationCodeGrant: vi.fn(() =>
    Promise.resolve({ access_token: 'at', claims: () => ({ sub: 'alice' }) })
  ),
  fetchUserInfo: vi.fn(() =>
    Promise.resolve({ sub: 'alice', name: 'Alice', email: 'alice@test' })
  )
}))

const config = readSsoConfig(
  {
    SSO_BASE_URL: 'https://sso.test/',
    SSO_CLIENT_ID: 'twaketasks',
    SSO_SCOPE: 'openid email profile',
    SSO_REDIRECT_URI: 'http://localhost:3000/auth/callback',
    SSO_POST_LOGOUT_REDIRECT: 'http://localhost:3000/'
  },
  'http://localhost:3000'
)

const assign = vi.fn<(url: URL) => void>()
const session = () => embedSession(config, assign)

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

describe('embedSession', () => {
  it('signs in without showing the SSO, coming back to the embedded page', async () => {
    window.history.replaceState(null, '', '/embed/spaces/s1')

    await expect(session().start()).resolves.toBeNull()

    const url = new URL(String(assign.mock.calls[0]?.[0]))
    expect(url.searchParams.get('prompt')).toBe('none')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/auth/callback'
    )

    window.history.replaceState(null, '', '/auth/callback?code=c&state=state')
    const user = await session().start()

    expect(user).toEqual({ name: 'Alice', email: 'alice@test' })
    expect(setTokenSet).toHaveBeenCalled()
    expect(vi.mocked(client.authorizationCodeGrant).mock.calls[0]?.[2]).toEqual(
      { pkceCodeVerifier: 'verifier', expectedState: 'state' }
    )
    expect(window.location.pathname).toBe('/embed/spaces/s1')
  })

  it('fails, back on the embedded page, when the SSO wants the user to sign in', async () => {
    window.history.replaceState(null, '', '/embed/spaces/s1')
    await session().start()

    window.history.replaceState(
      null,
      '',
      '/auth/callback?error=login_required&state=state'
    )

    await expect(session().start()).rejects.toThrow('login_required')
    expect(window.location.pathname).toBe('/embed/spaces/s1')
    expect(client.authorizationCodeGrant).not.toHaveBeenCalled()
  })

  it('signs in through a popup, then silently again', async () => {
    window.history.replaceState(null, '', '/embed/spaces/s1')
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const close = vi.spyOn(window, 'close').mockReturnValue()

    const signingIn = session().signIn()
    expect(open).toHaveBeenCalledWith('/', POPUP_NAME, expect.any(String))
    expect(assign).not.toHaveBeenCalled()

    await signInInPopup(fakeSession())
    await signingIn

    expect(close).toHaveBeenCalled()
    expect(assign).toHaveBeenCalledOnce()
  })

  it('signs in again silently when the backend refuses the token', async () => {
    window.history.replaceState(null, '', '/embed/spaces/s1')
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(null, { status: 401 })
    )
    const request = new Request('http://localhost:3000/api/boards', {
      headers: { Authorization: 'Bearer old' }
    })

    const response = await session().send(request)

    expect(response.status).toBe(401)
    expect(assign).toHaveBeenCalledOnce()
  })
})
