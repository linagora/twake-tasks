import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer
} from '@testcontainers/postgresql'
import postgres from 'postgres'
import type { TestProject } from 'vitest/node'
import { migrateLocked } from '../infra/db.ts'
import { checkInvariants } from './invariants.ts'

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
    ownerDatabaseUrl: string
  }
}

let container: StartedPostgreSqlContainer | undefined

// As in production: `owner` migrates and owns the tables, the app serves as
// `app`, which owns nothing and is not a superuser, so row level security
// applies to it and it cannot lift it.
export async function setup(project: TestProject): Promise<void> {
  const started = await new PostgreSqlContainer('postgres:18').start()
  container = started
  const admin = postgres(started.getConnectionUri(), {
    onnotice: () => undefined
  })
  await admin.unsafe(`create role owner login password 'owner'`)
  await admin.unsafe(`create role app login password 'app'`)
  await admin.unsafe(`create database tasks owner owner`)
  await admin.end()

  const as = (role: string) => {
    const url = new URL(started.getConnectionUri())
    url.username = role
    url.password = role
    url.pathname = '/tasks'
    return url.toString()
  }
  await migrateLocked(as('owner'), as('app'))
  project.provide('databaseUrl', as('app'))
  project.provide('ownerDatabaseUrl', as('owner'))
}

export async function teardown(): Promise<void> {
  if (!container) return
  try {
    const url = new URL(container.getConnectionUri())
    url.pathname = '/tasks'
    await checkInvariants(url.toString())
  } finally {
    await container.stop()
  }
}
