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

// 0 turns the limit off.
const limit = (fallback: number) =>
  z.coerce.number().int().min(0).default(fallback)
const seconds = (fallback: number) =>
  z.coerce.number().int().min(1).default(fallback)

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
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(0).default(5000),
    MIGRATE_ON_START: z.stringbool().default(true),
    APP_URL: z.url({ protocol: /^https?$/ }),
    OIDC_ISSUER: z.url({ protocol: /^https$/ }),
    OIDC_AUDIENCE: z.string().min(1).default('twaketasks'),
    OIDC_CLIENT_ID: z.string().min(1).default('twaketasks-backend'),
    OIDC_CLIENT_SECRET: z.string().min(1),
    OIDC_SEARCH_AUDIENCES: commaSeparated,
    SEARCH_ALLOWED_ORIGINS: origins,
    SEARCH_MIN_LENGTH: z.coerce.number().int().min(1).max(200).default(2),
    SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
    MAIL_FROM: z.string().min(1).default('Twake Project <tasks@twake.app>'),
    SMTP_TIMEOUT_SECONDS: seconds(60),
    JOBS_CONCURRENCY: z.coerce.number().int().min(1).default(1),
    JOBS_EMAIL_CONCURRENCY: z.coerce.number().int().min(1).default(2),
    JOBS_LEASE_SECONDS: seconds(600),
    HTTP_HOST: z.string().min(1).default('0.0.0.0'),
    HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    HTTP_TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).default(2),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }).optional(),
    RATE_LIMIT_USER_REQUESTS_MAX: limit(600),
    RATE_LIMIT_USER_REQUESTS_WINDOW_SECONDS: seconds(60),
    RATE_LIMIT_USER_WRITES_MAX: limit(120),
    RATE_LIMIT_USER_WRITES_WINDOW_SECONDS: seconds(60),
    RATE_LIMIT_TASK_CREATES_MAX: limit(60),
    RATE_LIMIT_TASK_CREATES_WINDOW_SECONDS: seconds(60),
    RATE_LIMIT_COMMENTS_MAX: limit(30),
    RATE_LIMIT_COMMENTS_WINDOW_SECONDS: seconds(60),
    RATE_LIMIT_REACTIONS_MAX: limit(60),
    RATE_LIMIT_REACTIONS_WINDOW_SECONDS: seconds(60),
    RATE_LIMIT_REMINDERS_MAX: limit(30),
    RATE_LIMIT_REMINDERS_WINDOW_SECONDS: seconds(60),
    RATE_LIMIT_LABEL_EDITS_MAX: limit(30),
    RATE_LIMIT_LABEL_EDITS_WINDOW_SECONDS: seconds(60),
    RATE_LIMIT_BOARD_CREATES_MAX: limit(20),
    RATE_LIMIT_BOARD_CREATES_WINDOW_SECONDS: seconds(3600),
    RATE_LIMIT_INVITES_MAX: limit(30),
    RATE_LIMIT_INVITES_WINDOW_SECONDS: seconds(3600),
    RATE_LIMIT_INVITES_DAILY_MAX: limit(100),
    RATE_LIMIT_INVITES_DAILY_WINDOW_SECONDS: seconds(86_400),
    RATE_LIMIT_SEARCH_MAX: limit(60),
    RATE_LIMIT_SEARCH_WINDOW_SECONDS: seconds(60),
    RATE_LIMIT_OTHER_APP_SEARCH_MAX: limit(30),
    RATE_LIMIT_OTHER_APP_SEARCH_WINDOW_SECONDS: seconds(60),
    RATE_LIMIT_PEOPLE_SEARCH_MAX: limit(60),
    RATE_LIMIT_PEOPLE_SEARCH_WINDOW_SECONDS: seconds(60),
    RATE_LIMIT_HEAVY_READS_MAX: limit(120),
    RATE_LIMIT_HEAVY_READS_WINDOW_SECONDS: seconds(60),
    RATE_LIMIT_STREAM_CONNECTS_MAX: limit(30),
    RATE_LIMIT_STREAM_CONNECTS_WINDOW_SECONDS: seconds(60),
    RATE_LIMIT_OPEN_STREAMS: limit(10),
    RATE_LIMIT_MENTIONS_PER_COMMENT: limit(20),
    RATE_LIMIT_PENDING_REMINDERS: limit(100),
    RATE_LIMIT_NOTIFICATION_EMAILS_MAX: limit(10),
    RATE_LIMIT_NOTIFICATION_EMAILS_WINDOW_SECONDS: seconds(600),
    RATE_LIMIT_REFUSED_TOKENS_MAX: limit(30),
    RATE_LIMIT_REFUSED_TOKENS_WINDOW_SECONDS: seconds(60),
    RATE_LIMIT_LOGOUT_REFUSALS_MAX: limit(60),
    RATE_LIMIT_LOGOUT_REFUSALS_WINDOW_SECONDS: seconds(60),
    RATE_LIMIT_TOKEN_CHECKS_PER_ADDRESS: limit(5),
    RATE_LIMIT_TOKEN_CHECKS: limit(50),
    RATE_LIMIT_REFUSED_TOKEN_CACHE_SECONDS: limit(60),
    RATE_LIMIT_REFUSED_TOKEN_CACHE_SIZE: limit(10_000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
    METRICS_ENABLED: z.stringbool().default(true)
  })
  // Draining the queue also unbinds it, so naming it twice would leave Tasks
  // deaf to every event.
  .refine(env => env.RABBITMQ_QUEUE !== env.RABBITMQ_OLD_QUEUE, {
    message:
      'RABBITMQ_QUEUE must differ from RABBITMQ_OLD_QUEUE, the queue of older versions that each start drains and unbinds',
    path: ['RABBITMQ_QUEUE']
  })
  // The SMTP timeouts apply to each step of a send, so one send can take a few.
  .refine(env => env.JOBS_LEASE_SECONDS >= 5 * env.SMTP_TIMEOUT_SECONDS, {
    message:
      'JOBS_LEASE_SECONDS must be at least 5 times SMTP_TIMEOUT_SECONDS, or a slow send outlives its lease and another replica sends the mail again',
    path: ['JOBS_LEASE_SECONDS']
  })
  .and(spaceIntegration)

export type Config = z.infer<typeof configSchema>

export interface Budget {
  max: number
  windowSeconds: number
}

const USER_BUDGETS = {
  requests: 'USER_REQUESTS',
  writes: 'USER_WRITES',
  taskCreates: 'TASK_CREATES',
  comments: 'COMMENTS',
  reactions: 'REACTIONS',
  reminders: 'REMINDERS',
  labelEdits: 'LABEL_EDITS',
  boardCreates: 'BOARD_CREATES',
  invites: 'INVITES',
  invitesDaily: 'INVITES_DAILY',
  search: 'SEARCH',
  otherAppSearch: 'OTHER_APP_SEARCH',
  peopleSearch: 'PEOPLE_SEARCH',
  heavyReads: 'HEAVY_READS',
  streamConnects: 'STREAM_CONNECTS'
} as const

export type UserBudget = keyof typeof USER_BUDGETS

type BudgetName =
  | (typeof USER_BUDGETS)[UserBudget]
  | 'REFUSED_TOKENS'
  | 'LOGOUT_REFUSALS'
  | 'NOTIFICATION_EMAILS'

function budget(config: Config, name: BudgetName): Budget {
  return {
    max: config[`RATE_LIMIT_${name}_MAX`],
    windowSeconds: config[`RATE_LIMIT_${name}_WINDOW_SECONDS`]
  }
}

export interface RateLimits {
  user: Record<UserBudget, Budget>
  openStreams: number
  mentionsPerComment: number
  pendingReminders: number
  notificationEmails: Budget
  address: {
    refusedTokens: Budget
    logoutRefusals: Budget
    tokenChecks: number
  }
  tokenChecks: number
  refusedTokenCache: { seconds: number; size: number }
}

export function rateLimits(config: Config): RateLimits {
  return {
    user: Object.fromEntries(
      Object.entries(USER_BUDGETS).map(([group, name]) => [
        group,
        budget(config, name)
      ])
    ) as Record<UserBudget, Budget>,
    openStreams: config.RATE_LIMIT_OPEN_STREAMS,
    mentionsPerComment: config.RATE_LIMIT_MENTIONS_PER_COMMENT,
    pendingReminders: config.RATE_LIMIT_PENDING_REMINDERS,
    notificationEmails: budget(config, 'NOTIFICATION_EMAILS'),
    address: {
      refusedTokens: budget(config, 'REFUSED_TOKENS'),
      logoutRefusals: budget(config, 'LOGOUT_REFUSALS'),
      tokenChecks: config.RATE_LIMIT_TOKEN_CHECKS_PER_ADDRESS
    },
    tokenChecks: config.RATE_LIMIT_TOKEN_CHECKS,
    refusedTokenCache: {
      seconds: config.RATE_LIMIT_REFUSED_TOKEN_CACHE_SECONDS,
      size: config.RATE_LIMIT_REFUSED_TOKEN_CACHE_SIZE
    }
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse({ SPACE_INTEGRATION: 'false', ...env })
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
