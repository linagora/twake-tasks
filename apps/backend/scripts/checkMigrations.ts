import { readdirSync, readFileSync } from 'node:fs'

// The migrations up to this one shipped before the rule and are not checked.
const lastUnchecked = '20261029182608_jobs_user_id'

const destructive = [
  /\bDROP\s+COLUMN\b/i,
  /\bDROP\s+TABLE\b/i,
  /\bALTER\s+(TABLE|TYPE)\b[^;]*\bRENAME\b/i,
  /\bSET\s+NOT\s+NULL\b/i,
  /\bDROP\s+DEFAULT\b/i,
  /\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i
]
const marker = /^--\s*contract:.+,\s*unused since backend (\d+\.\d+\.\d+)\s*$/m

// The replicas of the previous release still insert rows without the column.
const addsRequiredColumn = (code: string) =>
  code
    .split(/\bADD\s+COLUMN\b/i)
    .slice(1)
    .some(
      clause => /\bNOT\s+NULL\b/i.test(clause) && !/\bDEFAULT\b/i.test(clause)
    )

// Identifiers and literals are emptied so that a column named "default" or a
// value 'rename' is not read as a keyword.
const withoutNamesAndComments = (statement: string) =>
  statement.replace(/"[^"]*"|'[^']*'|--.*$/gm, match =>
    match.startsWith('--') ? '' : '""'
  )

export function uncontracted(sql: string, current: string): string[] {
  return sql.split('--> statement-breakpoint\n').filter(statement => {
    const code = withoutNamesAndComments(statement)
    if (
      !destructive.some(pattern => pattern.test(code)) &&
      !addsRequiredColumn(code)
    )
      return false
    const version = marker.exec(statement)?.[1]
    return (
      !version ||
      version.localeCompare(current, undefined, { numeric: true }) > 0
    )
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
