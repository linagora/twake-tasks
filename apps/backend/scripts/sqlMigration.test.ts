import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'
import { changedSqlFiles } from './sqlMigration.ts'

describe('changedSqlFiles', () => {
  it('lists the sql files the branch changed since it left origin/main, functions first', () => {
    const repo = mkdtempSync(join(tmpdir(), 'sql-migration-'))
    onTestFinished(() => {
      rmSync(repo, { recursive: true, force: true })
    })
    const backend = join(repo, 'apps/backend')
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
        { cwd: repo, stdio: 'ignore' }
      )
    const write = (path: string, content: string) => {
      mkdirSync(dirname(join(backend, path)), { recursive: true })
      writeFileSync(join(backend, path), content)
    }
    const commit = () => {
      git('add', '-A')
      git('commit', '-q', '--no-gpg-sign', '--no-verify', '-m', 'c')
    }

    git('init', '-q', '-b', 'main')
    for (const file of ['kept', 'edited', 'removed', 'from_main'])
      write(`sql/functions/${file}.sql`, 'v1')
    write('sql/triggers/committed.sql', 'v1')
    commit()
    git('branch', 'feature')
    write('sql/functions/from_main.sql', 'v2')
    commit()
    git('update-ref', 'refs/remotes/origin/main', 'main')
    git('checkout', '-q', 'feature')
    write('sql/triggers/committed.sql', 'v2')
    commit()
    write('sql/functions/edited.sql', 'v2')
    write('sql/functions/added.sql', 'v1')
    write('sql/README.md', 'v2')
    rmSync(join(backend, 'sql/functions/removed.sql'))

    expect(changedSqlFiles(backend)).toEqual([
      'sql/functions/added.sql',
      'sql/functions/edited.sql',
      'sql/triggers/committed.sql'
    ])
  })
})
