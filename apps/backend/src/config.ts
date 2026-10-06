import { z } from 'zod'

const kafkaSecurity = z.discriminatedUnion('KAFKA_SECURITY', [
  z.object({ KAFKA_SECURITY: z.literal('plaintext') }),
  z.object({
    KAFKA_SECURITY: z.literal('ssl'),
    KAFKA_SSL_CA: z.string().min(1),
    KAFKA_SSL_CERT: z.string().min(1),
    KAFKA_SSL_KEY: z.string().min(1)
  }),
  z.object({
    KAFKA_SECURITY: z.literal('sasl_ssl'),
    KAFKA_SASL_USERNAME: z.string().min(1),
    KAFKA_SASL_PASSWORD: z.string().min(1),
    KAFKA_SSL_CA: z.string().min(1).optional()
  })
])

const configSchema = z
  .object({
    KAFKA_BOOTSTRAP: z.string().min(1),
    RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    APP_URL: z.url({ protocol: /^https?$/ }),
    OIDC_ISSUER: z.url({ protocol: /^https$/ }),
    OIDC_AUDIENCE: z.string().min(1).default('twaketasks'),
    OIDC_CLIENT_ID: z.string().min(1).default('twaketasks-backend'),
    OIDC_CLIENT_SECRET: z.string().min(1),
    SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
    MAIL_FROM: z.string().min(1).default('Twake Tasks <tasks@twake.app>'),
    LDAP_REST_URL: z.url({ protocol: /^https?$/ }),
    LDAP_REST_SERVICE_ID: z.string().min(1).default('twake-tasks'),
    LDAP_REST_SECRET: z.string().min(1),
    HTTP_HOST: z.string().min(1).default('0.0.0.0'),
    HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info')
  })
  .and(kafkaSecurity)

export type Config = z.infer<typeof configSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env)
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
