import { readFileSync } from 'node:fs'
import postgres from 'postgres'
import { afterAll, expect, inject, it } from 'vitest'

const sql = postgres(inject('databaseUrl'), { max: 1 })

afterAll(async () => {
  await sql.end()
})

const documented = [
  ...readFileSync(
    new URL('../../../docs/data-lifecycle.md', import.meta.url),
    'utf8'
  ).matchAll(/^- `([a-z_]+)`/gm)
].map(match => match[1])

it('documents the lifecycle of every table, and of no table that is gone', async () => {
  const tables = await sql<{ name: string }[]>`
    select tablename as name from pg_tables where schemaname = 'public'`

  expect(documented.sort()).toEqual(tables.map(t => t.name).sort())
})
