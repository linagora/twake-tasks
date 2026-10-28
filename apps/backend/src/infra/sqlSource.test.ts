import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, describe, expect, inject, it } from 'vitest'

const sql = postgres(inject('databaseUrl'), { onnotice: () => undefined })

afterAll(async () => {
  await sql.end()
})

const root = fileURLToPath(new URL('../../sql/', import.meta.url))

type SqlFile = [path: string, content: string]

function sourceFiles(kind: string): SqlFile[] {
  return readdirSync(`${root}${kind}/`)
    .filter(file => file.endsWith('.sql'))
    .map(file => [
      `${kind}/${file}`,
      readFileSync(`${root}${kind}/${file}`, 'utf8')
    ])
}

// A file is the server's rendering made re-runnable in a migration, so a
// trigger gets OR REPLACE, which pg_get_triggerdef leaves out.
async function databaseFiles(): Promise<SqlFile[]> {
  const functions = await sql<{ name: string; definition: string }[]>`
    select p.proname as name, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'`
  const triggers = await sql<{ name: string; definition: string }[]>`
    select t.tgname as name, pg_get_triggerdef(t.oid) as definition
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal`
  return [
    ...functions.map((f): SqlFile => [
      `functions/${f.name}.sql`,
      `${f.definition.trimEnd()};\n`
    ]),
    ...triggers.map((t): SqlFile => [
      `triggers/${t.name}.sql`,
      `${t.definition.replace(/^CREATE TRIGGER/, 'CREATE OR REPLACE TRIGGER')};\n`
    ])
  ]
}

const byPath = (a: SqlFile, b: SqlFile) => a[0].localeCompare(b[0])

describe('the sql source files', () => {
  it('hold one file per function and trigger of the migrated database, as the server renders it', async () => {
    const files = [...sourceFiles('functions'), ...sourceFiles('triggers')]

    expect(files.sort(byPath)).toEqual((await databaseFiles()).sort(byPath))
  })
})
