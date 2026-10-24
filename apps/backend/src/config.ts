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

const commaSeparated = z
  .string()
  .default('')
  .transform(value =>
    value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  )

const origins = commaSeparated.pipe(
  z.array(
    z
      .url({ protocol: /^https?$/ })
      .refine(
        url => URL.canParse(url) && new URL(url).origin === url,
        'must be a bare origin'
      )
  )
)

const configSchema = z
  .object({
    RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
    RABBITMQ_SPACE_EXCHANGE: z.string().min(1).default('space'),
    RABBITMQ_B2B_EXCHANGE: z.string().min(1).default('b2b'),
    RABBITMQ_AUTH_EXCHANGE: z.string().min(1).default('auth'),
    RABBITMQ_SETTINGS_EXCHANGE: z.string().min(1).default('settings'),
    RABBITMQ_ACTIVITY_EXCHANGE: z.string().min(1).default('activity'),
    RABBITMQ_QUEUE: z.string().min(1).default('twake-tasks'),
    RABBITMQ_OLD_QUEUE: z.string().min(1).default('platform.all.twake-tasks'),
    RABBITMQ_CONCURRENCY: z.coerce.number().int().min(1).default(5),
    RABBITMQ_DEAD_LETTER_EXCHANGE: z.string().min(1).default('twake-tasks.dlx'),
    RABBITMQ_LIVE_EXCHANGE: z.string().min(1).default('twake-tasks.live'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(20),
    APP_URL: z.url({ protocol: /^https?$/ }),
    OIDC_ISSUER: z.url({ protocol: /^https$/ }),
    OIDC_AUDIENCE: z.string().min(1).default('twaketasks'),
    OIDC_CLIENT_ID: z.string().min(1).default('twaketasks-backend'),
    OIDC_CLIENT_SECRET: z.string().min(1),
    OIDC_SEARCH_AUDIENCES: commaSeparated,
    SEARCH_ALLOWED_ORIGINS: origins,
    SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
    MAIL_FROM: z.string().min(1).default('Twake Project <tasks@twake.app>'),
    HTTP_HOST: z.string().min(1).default('0.0.0.0'),
    HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info')
  })
  // Draining the queue also unbinds it, so naming it twice would leave Tasks
  // deaf to every event.
  .refine(env => env.RABBITMQ_QUEUE !== env.RABBITMQ_OLD_QUEUE, {
    message:
      'RABBITMQ_QUEUE must differ from RABBITMQ_OLD_QUEUE, the queue of older versions that each start drains and unbinds',
    path: ['RABBITMQ_QUEUE']
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
