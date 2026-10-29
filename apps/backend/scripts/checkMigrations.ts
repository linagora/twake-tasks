import { readdirSync, readFileSync } from 'node:fs'

// The migrations up to this one shipped before the rule and are not checked.
const lastUnchecked = '20261029182608_jobs_user_id'

const destructive = [
  /\bDROP\s+COLUMN\b/i,
  /\bDROP\s+TABLE\b/i,
  /\bRENAME\b/i,
  /\bSET\s+NOT\s+NULL\b/i,
  /\bALTER\s+COLUMN\s+("[^"]+"|\S+)\s+(SET\s+DATA\s+)?TYPE\b/i
]
const marker = /^--\s*contract:.+,\s*unused since backend (\d+\.\d+\.\d+)\s*$/m

// The replicas of the previous release still insert rows without the column.
const addsRequiredColumn = (code: string) =>
  (code.match(/\bADD\s+COLUMN\b[^,;]*/gi) ?? []).some(
    clause => /\bNOT\s+NULL\b/i.test(clause) && !/\bDEFAULT\b/i.test(clause)
  )

const parts = (version: string) => version.split('.').map(Number)

function released(version: string, current: string): boolean {
  const [a, b] = [parts(version), parts(current)]
  const differs = a.findIndex((part, i) => part !== b[i])
  return differs === -1 || (a[differs] ?? 0) < (b[differs] ?? 0)
}

export function uncontracted(sql: string, current: string): string[] {
  return sql.split('--> statement-breakpoint\n').filter(statement => {
    const code = statement.replace(/--.*$/gm, '')
    if (
      !destructive.some(pattern => pattern.test(code)) &&
      !addsRequiredColumn(code)
    )
      return false
    const version = marker.exec(statement)?.[1]
    return !version || !released(version, current)
  })
}

if (import.meta.main) {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as {
    version: string
  }
  const failures = readdirSync('drizzle')
    .filter(dir => dir > lastUnchecked)
    .flatMap(dir =>
      uncontracted(
        readFileSync(`drizzle/${dir}/migration.sql`, 'utf8'),
        version
      ).map(statement => `drizzle/${dir}/migration.sql:\n${statement.trim()}`)
    )
  if (failures.length > 0) {
    console.error(
      `${failures.join('\n\n')}\n\nThese statements break the replicas of the previous release. Ship them in a release after the one whose code stopped needing the column or table, behind a comment "-- contract: <reason>, unused since backend <that version>". See docs/development.md#database-migrations.`
    )
    process.exitCode = 1
  }
}
