import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).split('\n')

// Diffed from the merge base, so that a function changed on main since the
// branch started is not written back with the branch's older body. Sorted so
// that functions come before the triggers that call them.
export function changedSqlFiles(cwd: string): string[] {
  const [base = ''] = git(cwd, 'merge-base', 'origin/main', 'HEAD')
  return [
    ...git(
      cwd,
      'diff',
      '--name-only',
      '--relative',
      '--diff-filter=d',
      base,
      '--',
      'sql'
    ),
    ...git(cwd, 'ls-files', '--others', '--exclude-standard', '--', 'sql')
  ]
    .filter(path => path.endsWith('.sql'))
    .sort()
}

if (import.meta.main) {
  const name = process.argv[2]
  if (!name)
    throw new Error('Usage: npm run db:sql -w @twake-tasks/backend <name>')
  const files = changedSqlFiles('.')
  if (files.length === 0)
    throw new Error(
      'No file under sql/ added or changed since origin/main. A removed function or trigger needs its DROP written in a migration by hand.'
    )

  const before = new Set(readdirSync('drizzle'))
  execFileSync(
    'npx',
    ['drizzle-kit', 'generate', '--custom', `--name=${name}`],
    { stdio: 'inherit' }
  )
  const created = readdirSync('drizzle').find(dir => !before.has(dir))
  if (!created) throw new Error('drizzle-kit created no migration')

  writeFileSync(
    `drizzle/${created}/migration.sql`,
    files
      .map(file => readFileSync(file, 'utf8').trimEnd())
      .join('--> statement-breakpoint\n') + '\n'
  )
  console.log(`drizzle/${created}/migration.sql: ${files.join(', ')}`)
}
