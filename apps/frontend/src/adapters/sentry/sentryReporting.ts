import * as Sentry from '@sentry/react'

import {
  FEEDBACK_HOST_ID,
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

function sentryFeedback(
  integration: ReturnType<typeof Sentry.feedbackIntegration>
): FeedbackWidget {
  return {
    mount: texts => {
      const widget = integration.createWidget({ ...texts })
      return () => {
        widget.removeFromDom()
      }
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
  const feedback = config.feedback
    ? Sentry.feedbackIntegration({
        id: FEEDBACK_HOST_ID,
        autoInject: false,
        enableScreenshot: true,
        showBranding: false,
        showName: false,
        showEmail: true,
        isEmailRequired: false
      })
    : null

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release,
    initialScope: { tags: { app: 'twake-tasks' } },
    integrations: feedback ? [feedback] : [],
    denyUrls: [/^(chrome|moz|safari(-web)?)-extension:\/\//]
  })

  const report = Sentry.reactErrorHandler()
  return {
    reportCrash: (error, componentStack) => {
      report(error, { componentStack })
    },
    feedback: feedback ? sentryFeedback(feedback) : null
  }
}
