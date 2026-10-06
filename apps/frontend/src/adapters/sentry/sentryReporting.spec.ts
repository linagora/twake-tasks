import * as Sentry from '@sentry/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FeedbackTexts } from '@/application/reporting'
import {
  readSentryConfig,
  startSentry
} from '@/adapters/sentry/sentryReporting'

const widget = { removeFromDom: vi.fn() }
const integration = { name: 'Feedback', createWidget: vi.fn(() => widget) }
const handler = vi.fn()

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  feedbackIntegration: vi.fn(() => integration),
  reactErrorHandler: vi.fn(() => handler)
}))

const TEXTS = { triggerLabel: 'Feedback' } as FeedbackTexts

describe('readSentryConfig', () => {
  it('is off without a DSN', () => {
    expect(readSentryConfig({})).toBeNull()
    expect(
      readSentryConfig({ SENTRY_DSN: ' ', SENTRY_FEEDBACK_ENABLED: 'true' })
    ).toBeNull()
  })

  it('reads the DSN and the environment', () => {
    expect(
      readSentryConfig({
        SENTRY_DSN: 'https://key@errors.example.com/1',
        SENTRY_ENVIRONMENT: 'staging'
      })
    ).toEqual({
      dsn: 'https://key@errors.example.com/1',
      environment: 'staging',
      feedback: false
    })
  })

  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['1', false],
    ['TRUE', false],
    ['true', true]
  ])('reads feedback %j as %s', (value, expected) => {
    expect(
      readSentryConfig({
        SENTRY_DSN: 'https://key@errors.example.com/1',
        ...(value === undefined ? {} : { SENTRY_FEEDBACK_ENABLED: value })
      })?.feedback
    ).toBe(expected)
  })
})

describe('startSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing without a configuration', () => {
    const reporting = startSentry(null, '1.0.0')

    expect(Sentry.init).not.toHaveBeenCalled()
    expect(reporting.feedback).toBeNull()
    expect(() => {
      reporting.reportCrash(new Error('boom'), null)
    }).not.toThrow()
  })

  it('reports errors with the app, the release and the environment, and nothing else', () => {
    const reporting = startSentry(
      {
        dsn: 'https://key@errors.example.com/1',
        environment: 'prod',
        feedback: false
      },
      '1.2.3'
    )

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://key@errors.example.com/1',
        environment: 'prod',
        release: '1.2.3',
        initialScope: { tags: { app: 'twake-tasks' } },
        integrations: []
      })
    )
    const options = vi.mocked(Sentry.init).mock.calls[0]?.[0]
    expect(options).not.toHaveProperty('tracesSampleRate')
    expect(options).not.toHaveProperty('replaysSessionSampleRate')
    expect(Sentry.feedbackIntegration).not.toHaveBeenCalled()
    expect(reporting.feedback).toBeNull()

    const error = new Error('boom')
    reporting.reportCrash(error, '\n at Board')
    expect(handler).toHaveBeenCalledWith(error, {
      componentStack: '\n at Board'
    })
  })

  it('adds the bundled feedback form without its own button when turned on', () => {
    const reporting = startSentry(
      {
        dsn: 'https://key@errors.example.com/1',
        environment: undefined,
        feedback: true
      },
      '1.2.3'
    )

    expect(Sentry.feedbackIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        autoInject: false,
        enableScreenshot: true,
        showBranding: false,
        showName: false,
        showEmail: true,
        isEmailRequired: false
      })
    )
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ integrations: [integration] })
    )
    expect(integration.createWidget).not.toHaveBeenCalled()

    const unmount = reporting.feedback?.mount(TEXTS)
    expect(integration.createWidget).toHaveBeenCalledWith(TEXTS)
    expect(widget.removeFromDom).not.toHaveBeenCalled()
    unmount?.()
    expect(widget.removeFromDom).toHaveBeenCalledTimes(1)
  })
})
