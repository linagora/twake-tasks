import { randomUUID } from 'node:crypto'
import { pino } from 'pino'
import { inject } from 'vitest'
import { buildApp } from '../app.ts'
import { eq } from 'drizzle-orm'
import { createDb, inTenant, type Db } from '../infra/db.ts'
import type { Identity } from '../modules/auth/index.ts'
import { anIdentity } from '../modules/auth/testing.ts'
import type { Role } from '../modules/boards/access.ts'
import { listenToBoards } from '../modules/boards/live.ts'
import { boards, projectMembers, projects } from '../modules/boards/schema.ts'
import { listenToSettings } from '../modules/settings/live.ts'

export interface TestUser {
  userId: string
  email: string
  organizationId: string | null
  name?: string | null
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

/** Adds the person to the project of the owner's board. */
export async function joinBoard(
  db: Db,
  owner: TestUser,
  boardId: string,
  user: TestUser,
  role: Role
) {
  await inTenant(db, owner, async tx => {
    const [board] = await tx
      .select({ projectId: boards.projectId })
      .from(boards)
      .where(eq(boards.id, boardId))
    if (!board) throw new Error('no board')
    await tx.insert(projectMembers).values({
      projectId: board.projectId,
      organizationId: owner.organizationId,
      userId: user.userId,
      email: user.email,
      role
    })
  })
}

/** A project whose members come from an integration, such as a space. */
export async function aManagedProject(
  db: Db,
  members: [TestUser, Role][]
): Promise<string> {
  const [first] = members
  if (!first) throw new Error('a managed project needs members')
  const organizationId = first[0].organizationId
  return inTenant(db, first[0], async tx => {
    const [project] = await tx
      .insert(projects)
      .values({
        organizationId,
        name: 'Marketing',
        managed: true,
        createdBy: randomUUID()
      })
      .returning({ id: projects.id })
    if (!project) throw new Error('no project')
    await tx.insert(projectMembers).values(
      members.map(([user, role]) => ({
        projectId: project.id,
        organizationId,
        userId: user.userId,
        email: user.email,
        role
      }))
    )
    return project.id
  })
}

export async function aBoardIn(
  db: Db,
  user: TestUser,
  projectId: string,
  board: { name: string; keyPrefix: string }
): Promise<string> {
  return inTenant(db, user, async tx => {
    const [row] = await tx
      .insert(boards)
      .values({
        ...board,
        organizationId: user.organizationId,
        projectId,
        createdBy: user.userId
      })
      .returning({ id: boards.id })
    if (!row) throw new Error('no board')
    return row.id
  })
}

export async function startApp() {
  const { sql, db } = createDb(inject('databaseUrl'))
  const boardChanges = await listenToBoards(sql)
  const settingsChanges = await listenToSettings(sql)
  const app = await buildApp({
    logger: pino({ level: 'silent' }),
    db,
    boardChanges,
    settingsChanges,
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
        name: user.name ?? null,
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
      await settingsChanges.close()
      await sql.end()
    }
  }
}
