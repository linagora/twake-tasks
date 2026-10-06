import {
  attachFeedback,
  makeFeedbackIntegration
} from '@linagora/twake-feedback/sentry'
import * as Sentry from '@sentry/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  readSentryConfig,
  startSentry
} from '@/adapters/sentry/sentryReporting'

const integration = { name: 'Feedback', setTheme: vi.fn() }
const detach = vi.fn()
const handler = vi.fn()

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  reactErrorHandler: vi.fn(() => handler)
}))

vi.mock('@linagora/twake-feedback/sentry', () => ({
  makeFeedbackIntegration: vi.fn(() => integration),
  attachFeedback: vi.fn(() => detach)
}))

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
    expect(makeFeedbackIntegration).not.toHaveBeenCalled()
    expect(reporting.feedback).toBeNull()

    const error = new Error('boom')
    reporting.reportCrash(error, '\n at Board')
    expect(handler).toHaveBeenCalledWith(error, {
      componentStack: '\n at Board'
    })
  })

  it('adds the shared feedback integration, with its defaults, when turned on', () => {
    startSentry(
      {
        dsn: 'https://key@errors.example.com/1',
        environment: undefined,
        feedback: true
      },
      '1.2.3'
    )

    // No id: the package places the form on #sentry-feedback.
    expect(makeFeedbackIntegration).toHaveBeenCalledExactlyOnceWith()
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ integrations: [integration] })
    )
    expect(attachFeedback).not.toHaveBeenCalled()
  })

  it('attaches the form to the button, and detaches it', () => {
    const reporting = startSentry(
      {
        dsn: 'https://key@errors.example.com/1',
        environment: undefined,
        feedback: true
      },
      '1.2.3'
    )
    const button = document.createElement('button')
    const labels = { formTitle: 'Send feedback' }

    const detached = reporting.feedback?.attach(button, labels)

    expect(attachFeedback).toHaveBeenCalledWith(integration, button, labels)
    expect(detached).toBe(detach)
  })

  it('gives the color scheme of the app to the form', () => {
    const reporting = startSentry(
      {
        dsn: 'https://key@errors.example.com/1',
        environment: undefined,
        feedback: true
      },
      '1.2.3'
    )

    reporting.feedback?.setColorScheme('dark')

    expect(integration.setTheme).toHaveBeenCalledWith('dark')
  })
})
