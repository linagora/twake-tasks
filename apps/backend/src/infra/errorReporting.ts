import * as Sentry from '@sentry/node'

// Bounded values only. The rest of a log line can hold ids, the request or
// what someone typed.
const KEPT_LOG_FIELDS = ['msg', 'kind', 'routingKey']

const EMAIL = /[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/g

// A failed query's message ends with its parameters, which hold what people
// wrote.
const scrub = (text: string) =>
  text.replace(/\nparams: [\s\S]*$/, '').replace(EMAIL, '[email]')

const scrubEvent = (event: Sentry.ErrorEvent): Sentry.ErrorEvent => {
  const logged = event.contexts?.pino
  const pino =
    logged &&
    Object.fromEntries(
      Object.entries(logged)
        .filter(([key]) => KEPT_LOG_FIELDS.includes(key))
        .map(([key, value]) => [
          key,
          typeof value === 'string' ? scrub(value) : value
        ])
    )
  const scrubbed = { ...event }
  // Extra holds a thrown object that is not an Error, serialized whole.
  delete scrubbed.extra
  return {
    ...scrubbed,
    ...(event.message !== undefined && { message: scrub(event.message) }),
    ...(pino && { contexts: { ...event.contexts, pino } }),
    ...(event.exception?.values && {
      exception: {
        ...event.exception,
        values: event.exception.values.map(value => ({
          ...value,
          ...(value.value !== undefined && { value: scrub(value.value) })
        }))
      }
    })
  }
}

export function startErrorReporting(options: {
  dsn: string
  environment?: string | undefined
  release: string
  transport?: Sentry.NodeOptions['transport']
}): () => Promise<void> {
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    ...(options.transport && { transport: options.transport }),
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false
    },
    defaultIntegrations: false,
    integrations: [
      Sentry.pinoIntegration({
        log: { levels: [] },
        error: { levels: ['error', 'fatal'] }
      }),
      Sentry.onUncaughtExceptionIntegration(),
      // The default mode only warns, which would keep a crashed process alive.
      Sentry.onUnhandledRejectionIntegration({ mode: 'strict' }),
      Sentry.linkedErrorsIntegration()
    ],
    initialScope: { tags: { app: 'twake-tasks-backend' } },
    beforeSend: scrubEvent
  })
  return async () => {
    await Sentry.close(2000)
  }
}
