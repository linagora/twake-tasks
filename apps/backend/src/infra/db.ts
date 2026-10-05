import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
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

const currentOrganization = sql`nullif(current_setting('app.org_id', true), '')`

// B2C rows have no organization: a request without one only sees those.
export function tenantPolicy(column: AnyPgColumn) {
  const sameTenant = sql`${column} is not distinct from ${currentOrganization}`
  return pgPolicy('tenant', { using: sameTenant, withCheck: sameTenant })
}

export function createDb(url: string) {
  const client = postgres(url, { onnotice: () => undefined })
  return { sql: client, db: drizzle({ client }) }
}

export type Db = ReturnType<typeof createDb>['db']
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export function inTenant<T>(
  db: Db,
  organization: string | null,
  work: (tx: Tx) => Promise<T>
): Promise<T> {
  return db.transaction(async tx => {
    await tx.execute(
      sql`select set_config('app.org_id', ${organization ?? ''}, true)`
    )
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
