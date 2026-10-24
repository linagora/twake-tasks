import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'

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
      DATABASE_POOL_MAX: 20
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

describe('the server settings', () => {
  it('trust two proxies and keep counters in memory by default', () => {
    const config = loadConfig(required)

    expect(config).toMatchObject({ HTTP_TRUSTED_PROXY_HOPS: 2 })
    expect(config.REDIS_URL).toBeUndefined()
  })

  it.each([
    ['HTTP_TRUSTED_PROXY_HOPS', '-1'],
    ['REDIS_URL', 'http://redis:6379']
  ])('refuse %s=%s', (name, value) => {
    expect(() => loadConfig({ ...required, [name]: value })).toThrow(
      new RegExp(name)
    )
  })
})
