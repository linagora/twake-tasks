import { eq, sql as statement, type SQL } from 'drizzle-orm'
import { afterAll, describe, expect, inject, it } from 'vitest'
import {
  boardFavorites,
  boards,
  projectMembers,
  projects,
  sections,
  tasks
} from '../modules/boards/schema.ts'
import { aB2cUser, aUser, type TestUser } from '../testing/app.ts'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import postgres from 'postgres'
import {
  assertRowLevelSecurity,
  createDb,
  inTenant,
  isTransient,
  migrateDb
} from './db.ts'

const { sql, db } = createDb(inject('databaseUrl'))

afterAll(async () => {
  await sql.end()
})

function aProjectRow(owner: TestUser) {
  return {
    organizationId: owner.organizationId,
    name: 'Secret',
    createdBy: owner.userId
  }
}

async function aProjectOf(owner: TestUser) {
  return inTenant(db, owner, async tx => {
    const [project] = await tx
      .insert(projects)
      .values(aProjectRow(owner))
      .returning()
    if (!project) throw new Error('no project')
    await tx.insert(projectMembers).values({
      projectId: project.id,
      organizationId: owner.organizationId,
      userId: owner.userId,
      email: owner.email,
      role: 'admin'
    })
    const [board] = await tx
      .insert(boards)
      .values({
        projectId: project.id,
        organizationId: owner.organizationId,
        name: 'Secret',
        keyPrefix: 'SEC',
        createdBy: owner.userId
      })
      .returning()
    if (!board) throw new Error('no board')
    await tx.insert(sections).values({
      boardId: board.id,
      organizationId: owner.organizationId,
      name: 'To do',
      category: 'unstarted',
      position: 'a0'
    })
    return { projectId: project.id, boardId: board.id }
  })
}

const boardsSeenBy = (user: TestUser) =>
  inTenant(db, user, tx =>
    tx.select({ organizationId: boards.organizationId }).from(boards)
  )

const join = (
  projectId: string,
  user: TestUser,
  organizationId: string | null
) =>
  ({
    projectId,
    organizationId,
    userId: user.userId,
    email: user.email,
    role: 'viewer'
  }) as const

describe('inTenant', () => {
  it('only shows the rows of the current organization', async () => {
    const acme = aUser()
    const globex = aUser()
    await aProjectOf(acme)
    await aProjectOf(aB2cUser())

    expect(await boardsSeenBy(globex)).toEqual([])
    expect(await boardsSeenBy(acme)).toEqual([
      { organizationId: acme.organizationId }
    ])
  })

  it('refuses to write a row for another organization', async () => {
    const acme = aUser()
    const globex = aUser()

    await expect(
      inTenant(db, acme, tx => tx.insert(projects).values(aProjectRow(globex)))
    ).rejects.toThrow()
    await expect(
      inTenant(db, aB2cUser(), tx =>
        tx.insert(projects).values(aProjectRow(acme))
      )
    ).rejects.toThrow()
  })

  it('keeps B2C users to the projects they belong to', async () => {
    const alice = aB2cUser()
    const bob = aB2cUser()
    const { projectId, boardId } = await aProjectOf(alice)

    expect(await boardsSeenBy(alice)).toEqual([{ organizationId: null }])
    expect(await boardsSeenBy(bob)).toEqual([])
    expect(await inTenant(db, bob, tx => tx.select().from(projects))).toEqual(
      []
    )
    expect(
      await inTenant(db, bob, tx =>
        tx.select().from(sections).where(eq(sections.boardId, boardId))
      )
    ).toEqual([])
    await expect(
      inTenant(db, bob, tx =>
        tx.insert(projectMembers).values(join(projectId, bob, null))
      )
    ).rejects.toThrow()
  })

  it('shows a shared B2C project to its members', async () => {
    const alice = aB2cUser()
    const bob = aB2cUser()
    const { projectId } = await aProjectOf(alice)
    await inTenant(db, alice, tx =>
      tx.insert(projectMembers).values(join(projectId, bob, null))
    )

    expect(await boardsSeenBy(bob)).toEqual([{ organizationId: null }])
    expect(
      await inTenant(db, bob, tx =>
        tx
          .select({ email: projectMembers.email })
          .from(projectMembers)
          .where(eq(projectMembers.projectId, projectId))
      )
    ).toHaveLength(2)
  })

  it('keeps each person’s favorites to themselves', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const { projectId, boardId } = await aProjectOf(alice)
    const favorite = (user: TestUser) => ({
      boardId,
      organizationId: alice.organizationId,
      userId: user.userId
    })
    await inTenant(db, alice, async tx => {
      await tx
        .insert(projectMembers)
        .values(join(projectId, bob, alice.organizationId))
      await tx.insert(boardFavorites).values(favorite(alice))
    })

    expect(
      await inTenant(db, bob, tx => tx.select().from(boardFavorites))
    ).toEqual([])
    await expect(
      inTenant(db, bob, tx => tx.insert(boardFavorites).values(favorite(alice)))
    ).rejects.toThrow()
  })
})

describe('tenant foreign keys', () => {
  const FOREIGN_KEY_VIOLATION = '23503'
  const stray: Record<
    string,
    (ids: { projectId: string; boardId: string; taskId: string }) => SQL
  > = {
    project_members: ({ projectId }) =>
      statement`insert into project_members (project_id, org_id, user_id, email, role)
         values (${projectId}, null, uuidv7(), 'stray@example.com', 'viewer')`,
    boards: ({ projectId }) =>
      statement`insert into boards (project_id, org_id, name, key_prefix, created_by)
         values (${projectId}, null, 'Stray', 'STRAY', uuidv7())`,
    labels: ({ projectId }) =>
      statement`insert into labels (project_id, org_id, name)
         values (${projectId}, null, 'Stray')`,
    sections: ({ boardId }) =>
      statement`insert into sections (board_id, org_id, name, category, position)
         values (${boardId}, null, 'Stray', 'unstarted', 'z0')`,
    tasks: ({ boardId }) =>
      statement`insert into tasks (board_id, org_id, number, title, position, created_by)
         values (${boardId}, null, 99, 'Stray', 'z0', uuidv7())`,
    board_favorites: ({ boardId }) =>
      statement`insert into board_favorites (board_id, org_id, user_id)
         values (${boardId}, null, uuidv7())`,
    task_assignees: ({ taskId }) =>
      statement`insert into task_assignees (task_id, org_id, user_id)
         values (${taskId}, null, uuidv7())`
  }

  // Row level security already refuses these, so it is lifted to reach the keys.
  it.each(Object.entries(stray))(
    'refuses a B2C row in %s on an organization project',
    async (table, insert) => {
      const owner = aUser()
      const { projectId, boardId } = await aProjectOf(owner)
      const [task] = await inTenant(db, owner, tx =>
        tx
          .insert(tasks)
          .values({
            boardId,
            organizationId: owner.organizationId,
            number: 1,
            title: 'Logo',
            position: 'a0',
            createdBy: owner.userId
          })
          .returning({ id: tasks.id })
      )

      await expect(
        db.transaction(async tx => {
          await tx.execute(
            statement`alter table ${statement.identifier(table)} no force row level security`
          )
          await tx.execute(
            insert({ projectId, boardId, taskId: task?.id ?? '' })
          )
          tx.rollback()
        })
      ).rejects.toHaveProperty('cause.code', FOREIGN_KEY_VIOLATION)
    }
  )
})

describe('assertRowLevelSecurity', () => {
  it('accepts the app role, which is not a superuser', async () => {
    await expect(assertRowLevelSecurity(sql)).resolves.toBeUndefined()
  })

  it('forces row level security wherever it is enabled', async () => {
    const unforced = await sql`
      select relname from pg_class
      where relnamespace = 'public'::regnamespace
        and relrowsecurity and not relforcerowsecurity`

    expect(unforced).toEqual([])
  })
})

describe('isTransient', () => {
  const failure = (work: Promise<unknown>) =>
    work.then(
      () => {
        throw new Error('expected a failure')
      },
      (error: unknown) => error
    )
  const raise = (code: string) =>
    failure(
      db.execute(
        statement.raw(
          `do $$ begin raise exception 'boom' using errcode = '${code}'; end $$`
        )
      )
    )

  it('holds for a database that cannot be reached', async () => {
    const down = createDb('postgres://app:app@127.0.0.1:1/tasks')
    try {
      expect(
        isTransient(await failure(down.db.execute(statement`select 1`)))
      ).toBe(true)
    } finally {
      await down.sql.end()
    }
  })

  it.each(['40001', '40P01', '57P01', '53300', '08006'])(
    'holds for SQLSTATE %s',
    async code => {
      expect(isTransient(await raise(code))).toBe(true)
    }
  )

  it.each(['23505', '22P02', 'P0001'])(
    'does not hold for SQLSTATE %s',
    async code => {
      expect(isTransient(await raise(code))).toBe(false)
    }
  )

  it('does not hold for a plain error', () => {
    expect(isTransient(new Error('bug'))).toBe(false)
  })
})

describe('migrateDb', () => {
  it('migrates a Postgres 16 database, whose rows still get v7 ids', async () => {
    const container = await new PostgreSqlContainer('postgres:16').start()
    const admin = postgres(container.getConnectionUri(), {
      onnotice: () => undefined
    })
    await admin.unsafe(`create role app login password 'app'`)
    await admin.unsafe(`create database tasks owner app`)
    await admin.end()
    const url = new URL(container.getConnectionUri())
    url.username = 'app'
    url.password = 'app'
    url.pathname = '/tasks'
    const old = createDb(url.toString())
    try {
      await migrateDb(old.db)
      const owner = aUser()
      const [first, second] = await inTenant(old.db, owner, tx =>
        tx
          .insert(projects)
          .values([aProjectRow(owner), aProjectRow(owner)])
          .returning({ id: projects.id })
      )

      expect(first?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/)
      expect(second?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/)
    } finally {
      await old.sql.end()
      await container.stop()
    }
  }, 120_000)
})
