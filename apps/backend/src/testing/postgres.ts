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
    relayDatabaseUrl: string
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

  const as = (role: string, database = 'tasks') => {
    const url = new URL(started.getConnectionUri())
    url.username = role
    url.password = role
    url.pathname = `/${database}`
    return url.toString()
  }
  await migrateLocked(as('owner'), as('app'))
  // The relay deletes every event it publishes, so its tests get an outbox
  // no other test file writes to or reads back from.
  await admin.unsafe(`create database relay owner owner template tasks`)
  await admin.end()
  project.provide('databaseUrl', as('app'))
  project.provide('ownerDatabaseUrl', as('owner'))
  project.provide('relayDatabaseUrl', as('app', 'relay'))
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
