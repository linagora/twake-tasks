import { z } from 'zod'

// Off where there are no spaces; only the space integration reads ldap-rest.
const spaceIntegration = z.discriminatedUnion('SPACE_INTEGRATION', [
  z.object({ SPACE_INTEGRATION: z.literal('false') }),
  z.object({
    SPACE_INTEGRATION: z.literal('true'),
    LDAP_REST_URL: z.url({ protocol: /^https?$/ }),
    LDAP_REST_SERVICE_ID: z.string().min(1).default('twake-tasks'),
    LDAP_REST_SECRET: z.string().min(1)
  })
])

const configSchema = z
  .object({
    RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
    RABBITMQ_SPACE_EXCHANGE: z.string().min(1).default('space'),
    RABBITMQ_B2B_EXCHANGE: z.string().min(1).default('b2b'),
    RABBITMQ_AUTH_EXCHANGE: z.string().min(1).default('auth'),
    RABBITMQ_ACTIVITY_EXCHANGE: z.string().min(1).default('activity'),
    RABBITMQ_QUEUE: z.string().min(1).default('platform.all.twake-tasks'),
    RABBITMQ_DEAD_LETTER_EXCHANGE: z.string().min(1).default('twake-tasks.dlx'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    APP_URL: z.url({ protocol: /^https?$/ }),
    OIDC_ISSUER: z.url({ protocol: /^https$/ }),
    OIDC_AUDIENCE: z.string().min(1).default('twaketasks'),
    OIDC_CLIENT_ID: z.string().min(1).default('twaketasks-backend'),
    OIDC_CLIENT_SECRET: z.string().min(1),
    SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
    MAIL_FROM: z.string().min(1).default('Twake Tasks <tasks@twake.app>'),
    HTTP_HOST: z.string().min(1).default('0.0.0.0'),
    HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info')
  })
  .and(spaceIntegration)

export type Config = z.infer<typeof configSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse({ SPACE_INTEGRATION: 'false', ...env })
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
