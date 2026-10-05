import {
  addAuthorization,
  configureAuth,
  logOut,
  onSessionEndedElsewhere,
  setTokenSet,
  type AuthConfig
} from '@linagora/twake-oidc'
import * as client from 'openid-client'

import type { SessionService } from '@/application/session'

const STATE_KEY = 'embedSignIn'
export const POPUP_NAME = 'twake-tasks-sign-in'

export type EmbedSession = SessionService & {
  /** On a 401, signs in again silently instead of leaving for the SSO. */
  send: (request: Request) => Promise<Response>
}

interface Pending {
  codeVerifier: string
  state: string
  returnTo: string
}

function takePending(): Pending | null {
  try {
    return JSON.parse(sessionStorage.getItem(STATE_KEY) ?? 'null') as Pending
  } catch {
    return null
  } finally {
    sessionStorage.removeItem(STATE_KEY)
  }
}

export const isEmbedded = (): boolean =>
  window.location.pathname.startsWith('/embed/') ||
  sessionStorage.getItem(STATE_KEY) !== null

// LemonLDAP refuses to show its portal in a frame, so the embedded view signs
// in without it (prompt=none), on the strength of the SSO session the host
// page already has. Failing that, the user signs in through a popup.
export function embedSession(
  config: AuthConfig,
  navigate: (url: URL) => void = url => {
    window.location.assign(url)
  }
): EmbedSession {
  configureAuth(config)
  const redirectPath = new URL(config.redirectUri, window.location.href)
    .pathname
  const discover = () =>
    client.discovery(new URL(config.ssoUrl), config.clientId)

  async function signInSilently() {
    const codeVerifier = client.randomPKCECodeVerifier()
    const state = client.randomState()
    const url = client.buildAuthorizationUrl(await discover(), {
      redirect_uri: config.redirectUri,
      scope: config.scope,
      code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
      prompt: 'none'
    })
    const { pathname, search } = window.location
    const pending: Pending = {
      codeVerifier,
      state,
      returnTo: pathname + search
    }
    sessionStorage.setItem(STATE_KEY, JSON.stringify(pending))
    navigate(url)
  }

  return {
    async start() {
      const pending = takePending()
      if (window.location.pathname !== redirectPath || !pending) {
        await signInSilently()
        return null
      }
      const callback = new URL(window.location.href)
      window.history.replaceState(null, '', pending.returnTo)
      const error = callback.searchParams.get('error')
      if (error) throw new Error(error)
      const configuration = await discover()
      const tokens = await client.authorizationCodeGrant(
        configuration,
        callback,
        { pkceCodeVerifier: pending.codeVerifier, expectedState: pending.state }
      )
      const sub = tokens.claims()?.sub
      if (!sub) throw new Error('The SSO returned no ID token')
      const userinfo = await client.fetchUserInfo(
        configuration,
        tokens.access_token,
        sub
      )
      setTokenSet(tokens)
      return { name: userinfo.name ?? null, email: userinfo.email ?? null }
    },
    signIn: () =>
      new Promise<void>(resolve => {
        const channel = new BroadcastChannel(POPUP_NAME)
        channel.onmessage = () => {
          channel.close()
          resolve(signInSilently())
        }
        window.open('/', POPUP_NAME, 'popup,width=480,height=640')
      }),
    signOut: logOut,
    onEndedElsewhere: onSessionEndedElsewhere,
    async send(request) {
      addAuthorization(request)
      const response = await fetch(request)
      if (response.status === 401 && request.headers.has('Authorization')) {
        await signInSilently()
      }
      return response
    }
  }
}

// The popup is a first-party window: the SSO shows its portal there.
export async function signInInPopup(session: SessionService): Promise<void> {
  if (!(await session.start())) return
  const channel = new BroadcastChannel(POPUP_NAME)
  channel.postMessage('signed-in')
  channel.close()
  window.close()
}
