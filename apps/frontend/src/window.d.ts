export {}

declare global {
  interface Window {
    SSO_BASE_URL?: string
    SSO_CLIENT_ID?: string
    SSO_SCOPE?: string
    SSO_REDIRECT_URI?: string
    SSO_POST_LOGOUT_REDIRECT?: string
    /** Turns error reporting on. */
    SENTRY_DSN?: string
    SENTRY_ENVIRONMENT?: string
    /** "true" offers the feedback button, once SENTRY_DSN is set. */
    SENTRY_FEEDBACK_ENABLED?: string
  }
}
