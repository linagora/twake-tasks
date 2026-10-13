import { fileURLToPath } from 'node:url'
import { sql, type SQL } from 'drizzle-orm'
import {
  customType,
  pgPolicy,
  text,
  timestamp,
  type AnyPgColumn
} from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

export const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true })

// Fractional keys must compare byte by byte, whatever the database locale.
export const sortKey = customType<{ data: string }>({
  dataType: () => 'text COLLATE "C"'
})

export const organizationId = () => text('org_id')

// A foreign key holding a null is not checked, so rows reference their board's
// tenant through this column, which B2C rows fill too.
export const tenant = () =>
  text()
    .notNull()
    .generatedAlwaysAs(sql`coalesce(org_id, '')`)

const currentOrganization = sql`nullif(current_setting('app.org_id', true), '')`
export const currentUser = sql`nullif(current_setting('app.user_id', true), '')::uuid`

// B2C rows have no organization: a request without one only sees those, and
// only within `b2cScope`, since every B2C user shares the missing organization.
// It writes them within `b2cWriteScope`, which a table may narrow.
export function tenantPolicy(
  column: AnyPgColumn,
  b2cScope?: SQL,
  b2cWriteScope = b2cScope
) {
  const sameTenant = sql`${column} is not distinct from ${currentOrganization}`
  const scoped = (b2c: SQL | undefined) =>
    b2c ? sql`${sameTenant} and (${column} is not null or ${b2c})` : sameTenant
  return pgPolicy('tenant', {
    using: scoped(b2cScope),
    withCheck: scoped(b2cWriteScope)
  })
}

function connect(url: string) {
  const client = postgres(url, { onnotice: () => undefined })
  return { sql: client, db: drizzle({ client }) }
}

export type Db = ReturnType<typeof connect>['db']
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Transaction = Db['transaction']

const commitHooks = new WeakMap<Tx, (() => void)[]>()

// Drizzle has no commit hook. A savepoint hands its hooks to its transaction
// once it is released, so one that rolls back alone drops them.
function runHooksOnCommit(
  target: { transaction: Transaction },
  outer?: (() => void)[]
) {
  const transaction = target.transaction.bind(target)
  target.transaction = (async (
    body: (tx: Tx) => Promise<unknown>,
    config?: Parameters<Transaction>[1]
  ) => {
    const hooks: (() => void)[] = []
    const result = await transaction(tx => {
      commitHooks.set(tx, hooks)
      runHooksOnCommit(tx, hooks)
      return body(tx)
    }, config)
    if (outer) outer.push(...hooks)
    else for (const hook of hooks) hook()
    return result
  }) as Transaction
}

export function createDb(url: string) {
  const { sql, db } = connect(url)
  runHooksOnCommit(db)
  return { sql, db }
}

/** Runs `hook` once the transaction commits, and never if it rolls back. */
export function afterCommit(tx: Tx, hook: () => void): void {
  const hooks = commitHooks.get(tx)
  if (!hooks) throw new Error('not in a transaction')
  hooks.push(hook)
}

// Socket errors from Node, and postgres.js's own connection errors.
const CONNECTION_ERRORS = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED'
])

// Connection exceptions, insufficient resources, server shutting down,
// serialization failures and deadlocks, lock and statement timeouts.
const TRANSIENT_SQLSTATE = /^(08|53|57P0|40001$|40P01$|55P03$|57014$)/

/** Whether the work may succeed if tried again later, unchanged. */
export function isTransient(error: unknown): boolean {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    const code = (cause as { code?: unknown }).code
    if (typeof code !== 'string') continue
    if (CONNECTION_ERRORS.has(code)) return true
    if (cause.name === 'PostgresError') return TRANSIENT_SQLSTATE.test(code)
  }
  return false
}

interface TenantIdentity {
  organizationId: string | null
  userId: string
  email: string
}

export async function asTenant(tx: Tx, identity: TenantIdentity) {
  await tx.execute(
    sql`select set_config('app.org_id', ${identity.organizationId ?? ''}, true),
               set_config('app.user_id', ${identity.userId}, true),
               set_config('app.user_email', ${identity.email}, true)`
  )
}

// For work on behalf of no one, such as applying a platform event.
export async function asOrganization(tx: Tx, organizationId: string | null) {
  await tx.execute(
    sql`select set_config('app.org_id', ${organizationId ?? ''}, true),
               set_config('app.user_id', '', true),
               set_config('app.user_email', '', true)`
  )
}

export function inTenant<T>(
  db: Db,
  identity: TenantIdentity,
  work: (tx: Tx) => Promise<T>
): Promise<T> {
  return db.transaction(async tx => {
    await asTenant(tx, identity)
    return work(tx)
  })
}

export async function assertRowLevelSecurity(
  client: postgres.Sql
): Promise<void> {
  const [role] = await client<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
    select rolsuper, rolbypassrls from pg_roles where rolname = current_user`
  if (!role || role.rolsuper || role.rolbypassrls) {
    throw new Error(
      'The database role bypasses row level security: connect as a role without SUPERUSER and BYPASSRLS'
    )
  }
}

// Postgres has uuidv7() built in only from 18. Older servers get the same ids
// from this function: the millisecond time, then the random bits of a v4, with
// the version set to 7.
const uuidv7 = sql`
  create or replace function uuidv7() returns uuid language sql volatile as $$
    select encode(
      set_bit(set_bit(
        overlay(uuid_send(gen_random_uuid())
          placing substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
          from 1 for 6),
        52, 1), 53, 1), 'hex')::uuid
  $$`

export async function migrateDb(db: Db): Promise<void> {
  const [server] = await db.execute<{ version: number }>(
    sql`select current_setting('server_version_num')::int as version`
  )
  if (!server || server.version < 180000) await db.execute(uuidv7)
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url))
  })
}
