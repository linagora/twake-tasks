import { describe, expect, it } from 'vitest'
import { loadConfig, rateLimits } from './config.ts'

const required = {
  RABBITMQ_URL: 'amqp://rabbitmq:5672',
  DATABASE_URL: 'postgres://tasks@postgres/tasks',
  APP_URL: 'https://tasks.example.com',
  OIDC_ISSUER: 'https://auth.example.com',
  OIDC_CLIENT_SECRET: 'secret'
}

describe('the RabbitMQ names', () => {
  it('default to the names the platform uses', () => {
    expect(loadConfig(required)).toMatchObject({
      RABBITMQ_SPACE_EXCHANGE: 'space',
      RABBITMQ_B2B_EXCHANGE: 'b2b',
      RABBITMQ_AUTH_EXCHANGE: 'auth',
      RABBITMQ_ACTIVITY_EXCHANGE: 'activity',
      RABBITMQ_QUEUE: 'twake-tasks',
      RABBITMQ_OLD_QUEUE: 'platform.all.twake-tasks',
      RABBITMQ_CONCURRENCY: 5,
      RABBITMQ_DEAD_LETTER_EXCHANGE: 'twake-tasks.dlx',
      RABBITMQ_LIVE_EXCHANGE: 'twake-tasks.live',
      DATABASE_POOL_MAX: 20,
      DATABASE_STATEMENT_TIMEOUT_MS: 5000,
      SEARCH_MIN_LENGTH: 2
    })
  })

  it('refuse to consume from the queue of older versions', () => {
    expect(() =>
      loadConfig({ ...required, RABBITMQ_QUEUE: 'platform.all.twake-tasks' })
    ).toThrow(/RABBITMQ_QUEUE must differ from RABBITMQ_OLD_QUEUE/)
    expect(() =>
      loadConfig({
        ...required,
        RABBITMQ_QUEUE: 'staging.tasks',
        RABBITMQ_OLD_QUEUE: 'staging.tasks'
      })
    ).toThrow(/RABBITMQ_OLD_QUEUE/)
  })

  it('can be renamed, but not emptied', () => {
    expect(
      loadConfig({ ...required, RABBITMQ_QUEUE: 'staging.twake-tasks' })
    ).toMatchObject({ RABBITMQ_QUEUE: 'staging.twake-tasks' })
    expect(() =>
      loadConfig({ ...required, RABBITMQ_ACTIVITY_EXCHANGE: '' })
    ).toThrow(/RABBITMQ_ACTIVITY_EXCHANGE/)
  })
})

describe('the space integration setting', () => {
  it('is off by default, and then needs no ldap-rest', () => {
    expect(loadConfig(required)).toMatchObject({ SPACE_INTEGRATION: 'false' })
  })

  it('needs ldap-rest when on', () => {
    expect(() =>
      loadConfig({ ...required, SPACE_INTEGRATION: 'true' })
    ).toThrow(/LDAP_REST_URL/)
    expect(
      loadConfig({
        ...required,
        SPACE_INTEGRATION: 'true',
        LDAP_REST_URL: 'https://ldap-rest.example.com',
        LDAP_REST_SECRET: 'secret'
      })
    ).toMatchObject({
      SPACE_INTEGRATION: 'true',
      LDAP_REST_SERVICE_ID: 'twake-tasks'
    })
  })
})

describe('the search settings', () => {
  it('open search to no other audience and no other origin by default', () => {
    expect(loadConfig(required)).toMatchObject({
      OIDC_SEARCH_AUDIENCES: [],
      SEARCH_ALLOWED_ORIGINS: []
    })
  })

  it('read comma separated lists', () => {
    expect(
      loadConfig({
        ...required,
        OIDC_SEARCH_AUDIENCES: ' twakespace, ,other ',
        SEARCH_ALLOWED_ORIGINS:
          'https://space.example.com, http://localhost:5173'
      })
    ).toMatchObject({
      OIDC_SEARCH_AUDIENCES: ['twakespace', 'other'],
      SEARCH_ALLOWED_ORIGINS: [
        'https://space.example.com',
        'http://localhost:5173'
      ]
    })
  })

  it.each([
    ['a path', 'https://space.example.com/'],
    ['no scheme', 'space.example.com'],
    ['a wildcard', '*']
  ])('refuse an origin with %s', (_case, origin) => {
    expect(() =>
      loadConfig({ ...required, SEARCH_ALLOWED_ORIGINS: origin })
    ).toThrow(/SEARCH_ALLOWED_ORIGINS/)
  })
})

describe('the migration setting', () => {
  it('migrates at start by default', () => {
    expect(loadConfig(required).MIGRATE_ON_START).toBe(true)
  })

  it('can leave migrations to the migrate command', () => {
    expect(
      loadConfig({ ...required, MIGRATE_ON_START: 'false' }).MIGRATE_ON_START
    ).toBe(false)
  })

  it('refuses a value that is not a boolean', () => {
    expect(() =>
      loadConfig({ ...required, MIGRATE_ON_START: 'later' })
    ).toThrow(/MIGRATE_ON_START/)
  })
})

describe('the server settings', () => {
  it('trust two proxies and keep counters in memory by default', () => {
    const config = loadConfig(required)

    expect(config).toMatchObject({
      HTTP_TRUSTED_PROXY_HOPS: 2,
      JOBS_CONCURRENCY: 1,
      JOBS_EMAIL_CONCURRENCY: 2,
      JOBS_LEASE_SECONDS: 600,
      SMTP_TIMEOUT_SECONDS: 60
    })
    expect(config.REDIS_URL).toBeUndefined()
  })

  it('serve metrics unless turned off', () => {
    expect(loadConfig(required).METRICS_ENABLED).toBe(true)
    expect(
      loadConfig({ ...required, METRICS_ENABLED: 'false' }).METRICS_ENABLED
    ).toBe(false)
  })

  it.each([
    ['HTTP_TRUSTED_PROXY_HOPS', '-1'],
    ['REDIS_URL', 'http://redis:6379'],
    ['DATABASE_STATEMENT_TIMEOUT_MS', '-1'],
    ['SEARCH_MIN_LENGTH', '0'],
    ['RATE_LIMIT_COMMENTS_MAX', '-1'],
    ['RATE_LIMIT_COMMENTS_MAX', '1.5'],
    ['RATE_LIMIT_COMMENTS_WINDOW_SECONDS', '0'],
    ['RATE_LIMIT_OPEN_STREAMS', 'ten'],
    ['RATE_LIMIT_NOTIFICATION_EMAILS_WINDOW_SECONDS', '0'],
    ['JOBS_CONCURRENCY', '0'],
    ['JOBS_LEASE_SECONDS', '0'],
    ['JOBS_LEASE_SECONDS', '120'],
    ['SMTP_TIMEOUT_SECONDS', '0'],
    ['METRICS_ENABLED', 'maybe']
  ])('refuse %s=%s', (name, value) => {
    expect(() => loadConfig({ ...required, [name]: value })).toThrow(
      new RegExp(name)
    )
  })
})

describe('the rate limits', () => {
  it('default to the starting budgets', () => {
    const limits = rateLimits(loadConfig(required))

    expect(limits.user).toMatchObject({
      requests: { max: 600, windowSeconds: 60 },
      writes: { max: 120, windowSeconds: 60 },
      comments: { max: 30, windowSeconds: 60 },
      boardCreates: { max: 20, windowSeconds: 3600 },
      invites: { max: 30, windowSeconds: 3600 },
      invitesDaily: { max: 100, windowSeconds: 86_400 },
      otherAppSearch: { max: 30, windowSeconds: 60 },
      streamConnects: { max: 30, windowSeconds: 60 }
    })
    expect(limits).toMatchObject({
      openStreams: 10,
      mentionsPerComment: 20,
      pendingReminders: 100,
      notificationEmails: { max: 10, windowSeconds: 600 },
      address: {
        refusedTokens: { max: 30, windowSeconds: 60 },
        logoutRefusals: { max: 60, windowSeconds: 60 },
        tokenChecks: 5
      },
      tokenChecks: 50,
      refusedTokenCache: { seconds: 60, size: 10_000 }
    })
  })

  it('read each budget and window, and take 0 to turn a limit off', () => {
    const limits = rateLimits(
      loadConfig({
        ...required,
        RATE_LIMIT_TASK_CREATES_MAX: '0',
        RATE_LIMIT_TASK_CREATES_WINDOW_SECONDS: '10',
        RATE_LIMIT_OPEN_STREAMS: '0',
        RATE_LIMIT_TOKEN_CHECKS: '200'
      })
    )

    expect(limits.user.taskCreates).toEqual({ max: 0, windowSeconds: 10 })
    expect(limits.openStreams).toBe(0)
    expect(limits.tokenChecks).toBe(200)
  })
})
