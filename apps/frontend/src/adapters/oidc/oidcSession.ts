import {
  completeLogin,
  configureAuth,
  logOut,
  onSessionEndedElsewhere,
  startLogin,
  type AuthConfig
} from '@linagora/twake-oidc'

import type { SessionService } from '@/application/session'

export type SsoSettings = Pick<
  Window,
  | 'SSO_BASE_URL'
  | 'SSO_CLIENT_ID'
  | 'SSO_SCOPE'
  | 'SSO_REDIRECT_URI'
  | 'SSO_POST_LOGOUT_REDIRECT'
>

export function readSsoConfig(
  settings: SsoSettings,
  apiUrl: string
): AuthConfig {
  const {
    SSO_BASE_URL,
    SSO_CLIENT_ID,
    SSO_SCOPE,
    SSO_REDIRECT_URI,
    SSO_POST_LOGOUT_REDIRECT
  } = settings
  if (
    !SSO_BASE_URL ||
    !SSO_CLIENT_ID ||
    !SSO_SCOPE ||
    !SSO_REDIRECT_URI ||
    !SSO_POST_LOGOUT_REDIRECT
  ) {
    throw new Error(
      '/.env.js must set SSO_BASE_URL, SSO_CLIENT_ID, SSO_SCOPE, SSO_REDIRECT_URI and SSO_POST_LOGOUT_REDIRECT'
    )
  }
  return {
    ssoUrl: SSO_BASE_URL,
    clientId: SSO_CLIENT_ID,
    scope: SSO_SCOPE,
    redirectUri: SSO_REDIRECT_URI,
    postLogoutRedirectUri: SSO_POST_LOGOUT_REDIRECT,
    apiUrl
  }
}

export function oidcSession(config: AuthConfig): SessionService {
  configureAuth(config)
  const redirectPath = new URL(config.redirectUri, window.location.href)
    .pathname

  return {
    async start() {
      if (window.location.pathname === redirectPath) {
        const login = await completeLogin()
        if (login) {
          window.history.replaceState(null, '', login.returnTo)
          return {
            name: login.userinfo.name ?? null,
            email: login.userinfo.email ?? null
          }
        }
      }
      await startLogin()
      return null
    },
    signIn: startLogin,
    signOut: logOut,
    onEndedElsewhere: onSessionEndedElsewhere
  }
}
