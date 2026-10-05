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
export function tenantPolicy(column: AnyPgColumn, b2cScope?: SQL) {
  const sameTenant = sql`${column} is not distinct from ${currentOrganization}`
  const scoped = b2cScope
    ? sql`${sameTenant} and (${column} is not null or ${b2cScope})`
    : sameTenant
  return pgPolicy('tenant', { using: scoped, withCheck: scoped })
}

export function createDb(url: string) {
  const client = postgres(url, { onnotice: () => undefined })
  return { sql: client, db: drizzle({ client }) }
}

export type Db = ReturnType<typeof createDb>['db']
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

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

export async function migrateDb(db: Db): Promise<void> {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url))
  })
}
