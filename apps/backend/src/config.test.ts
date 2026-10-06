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
      RABBITMQ_QUEUE: 'platform.all.twake-tasks',
      RABBITMQ_DEAD_LETTER_EXCHANGE: 'twake-tasks.dlx'
    })
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
