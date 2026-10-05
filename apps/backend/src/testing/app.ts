import { randomUUID } from 'node:crypto'
import { pino } from 'pino'
import { inject } from 'vitest'
import { buildApp } from '../app.ts'
import { createDb } from '../infra/db.ts'
import type { Identity } from '../modules/auth/index.ts'
import { anIdentity } from '../modules/auth/testing.ts'
import { listenToBoards } from '../modules/boards/live.ts'

export interface TestUser {
  userId: string
  email: string
  organizationId: string | null
}

// Each test gets its own people and organizations, so tests share one database.
export function aUser(overrides: Partial<TestUser> = {}): TestUser {
  const unique = randomUUID()
  return {
    userId: unique,
    email: `user-${unique}@example.com`,
    organizationId: `org-${unique}`,
    ...overrides
  }
}

export function aB2cUser(): TestUser {
  return aUser({ organizationId: null })
}

export async function startApp() {
  const { sql, db } = createDb(
    inject('databaseUrl'),
    'https://tasks.example.com/'
  )
  const boardChanges = await listenToBoards(sql)
  const app = await buildApp({
    logger: pino({ level: 'silent' }),
    db,
    boardChanges,
    provider: {
      identify: () => Promise.resolve(null),
      verifyLogoutToken: () => Promise.reject(new Error('not in tests'))
    },
    authenticate: token =>
      Promise.resolve(
        anIdentity(
          JSON.parse(Buffer.from(token, 'base64url').toString()) as Identity
        )
      ),
    isReady: () => Promise.resolve(true)
  })

  function tokenOf(user: TestUser) {
    return Buffer.from(
      JSON.stringify({
        subject: user.userId,
        userId: user.userId,
        email: user.email,
        organizationId: user.organizationId,
        organizationRole: user.organizationId ? 'member' : null
      })
    ).toString('base64url')
  }

  function as(user: TestUser) {
    const headers = { authorization: `Bearer ${tokenOf(user)}` }
    return {
      get: (path: string) =>
        app.inject({ method: 'GET', url: `/api${path}`, headers }),
      post: (path: string, payload: object) =>
        app.inject({ method: 'POST', url: `/api${path}`, headers, payload }),
      patch: (path: string, payload: object) =>
        app.inject({ method: 'PATCH', url: `/api${path}`, headers, payload }),
      put: (path: string, payload: object = {}) =>
        app.inject({ method: 'PUT', url: `/api${path}`, headers, payload }),
      delete: (path: string, payload: object = {}) =>
        app.inject({ method: 'DELETE', url: `/api${path}`, headers, payload })
    }
  }

  return {
    as,
    tokenOf,
    listen: () => app.listen({ host: '127.0.0.1', port: 0 }),
    close: async () => {
      await app.close()
      await boardChanges.close()
      await sql.end()
    }
  }
}
