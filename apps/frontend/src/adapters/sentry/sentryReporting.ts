import {
  attachFeedback,
  makeFeedbackIntegration,
  type FeedbackIntegration
} from '@linagora/twake-feedback/sentry'
import * as Sentry from '@sentry/react'

import {
  noReporting,
  type FeedbackWidget,
  type Reporting
} from '@/application/reporting'

export interface SentryConfig {
  dsn: string
  environment: string | undefined
  feedback: boolean
}

/** Null without a DSN: the app then runs without Sentry. */
export function readSentryConfig(
  win: Pick<
    Window,
    'SENTRY_DSN' | 'SENTRY_ENVIRONMENT' | 'SENTRY_FEEDBACK_ENABLED'
  >
): SentryConfig | null {
  const dsn = win.SENTRY_DSN?.trim() ?? ''
  if (dsn === '') return null
  const environment = win.SENTRY_ENVIRONMENT?.trim() ?? ''
  return {
    dsn,
    environment: environment === '' ? undefined : environment,
    feedback: win.SENTRY_FEEDBACK_ENABLED === 'true'
  }
}

function sentryFeedback(integration: FeedbackIntegration): FeedbackWidget {
  return {
    attach: (el, labels) => attachFeedback(integration, el, labels),
    setColorScheme: scheme => {
      integration.setTheme(scheme)
    }
  }
}

// Query strings hold the sign-in code and state on /auth/callback, and what
// people search for on /api/search.
const QUERY = /[?#].*$/s
const withoutQuery = (url: unknown) =>
  typeof url === 'string' ? url.replace(QUERY, '') : url

export const scrubBreadcrumb = (
  breadcrumb: Sentry.Breadcrumb
): Sentry.Breadcrumb => {
  if (!breadcrumb.data) return breadcrumb
  const data = { ...breadcrumb.data }
  for (const key of ['url', 'from', 'to']) {
    if (key in data) data[key] = withoutQuery(data[key])
  }
  return { ...breadcrumb, data }
}

export const scrubEvent = <E extends Sentry.Event>(event: E): E => {
  const request = event.request
  if (!request) return event
  const headers = { ...request.headers }
  delete headers.Referer
  return {
    ...event,
    request: {
      ...request,
      url: request.url?.replace(QUERY, ''),
      query_string: undefined,
      headers
    }
  }
}

/**
 * Starts Sentry for errors, and for the feedback form when turned on. No
 * tracing, no replay, and no user: the form's email is the only identity.
 */
export function startSentry(
  config: SentryConfig | null,
  release: string
): Reporting {
  if (!config) return noReporting

  // The sync integration is bundled; the async one loads from Sentry's CDN,
  // which script-src 'self' refuses.
  const feedback = config.feedback ? makeFeedbackIntegration() : null

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release,
    initialScope: { tags: { app: 'twake-tasks' } },
    integrations: feedback ? [feedback] : [],
    denyUrls: [/^(chrome|moz|safari(-web)?)-extension:\/\//],
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent
  })

  const report = Sentry.reactErrorHandler()
  return {
    reportCrash: (error, componentStack) => {
      report(error, { componentStack })
    },
    feedback: feedback ? sentryFeedback(feedback) : null
  }
}
