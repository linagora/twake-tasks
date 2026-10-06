import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'

const required = {
  KAFKA_BOOTSTRAP: 'kafka:9092',
  KAFKA_SECURITY: 'plaintext',
  RABBITMQ_URL: 'amqp://rabbitmq:5672',
  DATABASE_URL: 'postgres://tasks@postgres/tasks',
  APP_URL: 'https://tasks.example.com',
  OIDC_ISSUER: 'https://auth.example.com',
  OIDC_CLIENT_SECRET: 'secret'
}

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
