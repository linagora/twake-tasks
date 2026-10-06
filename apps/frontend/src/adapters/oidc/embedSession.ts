import {
  addAuthorization,
  configureAuth,
  logOut,
  onSessionEndedElsewhere,
  setTokenSet,
  type AuthConfig
} from '@linagora/twake-oidc'
import * as client from 'openid-client'

import type { SessionService, User } from '@/application/session'

export const SILENT_NAME = 'twake-tasks-silent-sign-in'
export const POPUP_NAME = 'twake-tasks-sign-in'
const CALLBACK = 'twake-tasks:sso-callback'
const SILENT_TIMEOUT_MS = 10_000

export type EmbedSession = SessionService & {
  /** On a 401, signs in again silently and retries once. */
  send: (request: Request) => Promise<Response>
}

export const isEmbedded = (): boolean =>
  window.location.pathname.startsWith('/embed/')

// The embed never leaves its page for the SSO: a browser shows an error page,
// with no way back, in a frame the SSO refuses to be shown in. A window the
// embed opens (a hidden frame, or a popup) goes instead, and once back on the
// redirect URI hands the SSO's answer to the embed.
export function relayCallback(
  self: { name: string; href: string } = {
    name: window.name,
    href: window.location.href
  }
): boolean {
  const to =
    self.name === SILENT_NAME
      ? window.parent
      : self.name === POPUP_NAME
        ? (window.opener as Window | null)
        : null
  if (!to) return false
  to.postMessage({ type: CALLBACK, url: self.href }, window.location.origin)
  return true
}

function callbackFrom(source: () => Window | null, timeoutMs?: number) {
  return new Promise<URL>((resolve, reject) => {
    const timer =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            done()
            reject(new Error('no answer from the SSO'))
          }, timeoutMs)
    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        event.origin !== window.location.origin ||
        event.source === null ||
        event.source !== source()
      ) {
        return
      }
      const data = event.data as { type?: unknown; url?: unknown } | null
      if (data?.type !== CALLBACK || typeof data.url !== 'string') return
      done()
      resolve(new URL(data.url))
    }
    const done = () => {
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
    }
    window.addEventListener('message', onMessage)
  })
}

export function embedSession(config: AuthConfig): EmbedSession {
  configureAuth(config)
  const discover = () =>
    client.discovery(new URL(config.ssoUrl), config.clientId)

  async function signInAt(
    open: (url: URL) => () => Window | null,
    options: { prompt?: string; timeoutMs?: number }
  ): Promise<User> {
    const configuration = await discover()
    const codeVerifier = client.randomPKCECodeVerifier()
    const state = client.randomState()
    const url = client.buildAuthorizationUrl(configuration, {
      redirect_uri: config.redirectUri,
      scope: config.scope,
      code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
      ...(options.prompt ? { prompt: options.prompt } : {})
    })
    const callback = await callbackFrom(open(url), options.timeoutMs)
    const error = callback.searchParams.get('error')
    if (error) throw new Error(error)
    const tokens = await client.authorizationCodeGrant(
      configuration,
      callback,
      { pkceCodeVerifier: codeVerifier, expectedState: state }
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
  }

  async function signInSilently(): Promise<User> {
    const frame = document.createElement('iframe')
    frame.name = SILENT_NAME
    frame.hidden = true
    try {
      return await signInAt(
        url => {
          frame.src = url.href
          document.body.append(frame)
          return () => frame.contentWindow
        },
        { prompt: 'none', timeoutMs: SILENT_TIMEOUT_MS }
      )
    } finally {
      frame.remove()
    }
  }

  return {
    start: signInSilently,
    signIn() {
      // Opened before any await, while the click still allows a popup
      const popup = window.open('', POPUP_NAME, 'popup,width=480,height=640')
      if (!popup) return Promise.reject(new Error('popup blocked'))
      return signInAt(url => {
        popup.location.href = url.href
        return () => popup
      }, {}).finally(() => {
        popup.close()
      })
    },
    signOut: logOut,
    onEndedElsewhere: onSessionEndedElsewhere,
    async send(request) {
      const retry = request.clone()
      addAuthorization(request)
      const response = await fetch(request)
      if (response.status !== 401 || !request.headers.has('Authorization')) {
        return response
      }
      try {
        await signInSilently()
      } catch {
        return response
      }
      addAuthorization(retry)
      return fetch(retry)
    }
  }
}
