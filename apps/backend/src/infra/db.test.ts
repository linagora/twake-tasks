import { eq, sql as statement, type SQL } from 'drizzle-orm'
import { afterAll, describe, expect, inject, it } from 'vitest'
import {
  boardFavorites,
  boardMembers,
  boards,
  sections,
  tasks
} from '../modules/boards/schema.ts'
import { aB2cUser, aUser, type TestUser } from '../testing/app.ts'
import { assertRowLevelSecurity, createDb, inTenant } from './db.ts'

const { sql, db } = createDb(inject('databaseUrl'))

afterAll(async () => {
  await sql.end()
})

function aBoardRow(owner: TestUser) {
  return {
    organizationId: owner.organizationId,
    ownerId: owner.userId,
    name: 'Secret',
    keyPrefix: 'SEC',
    createdBy: owner.userId
  }
}

async function aBoardOf(owner: TestUser) {
  return inTenant(db, owner, async tx => {
    const [board] = await tx.insert(boards).values(aBoardRow(owner)).returning()
    if (!board) throw new Error('no board')
    await tx.insert(boardMembers).values({
      boardId: board.id,
      organizationId: owner.organizationId,
      userId: owner.userId,
      email: owner.email,
      role: 'admin'
    })
    await tx.insert(sections).values({
      boardId: board.id,
      organizationId: owner.organizationId,
      name: 'To do',
      category: 'unstarted',
      position: 'a0'
    })
    return board.id
  })
}

const boardsSeenBy = (user: TestUser) =>
  inTenant(db, user, tx =>
    tx.select({ organizationId: boards.organizationId }).from(boards)
  )

describe('inTenant', () => {
  it('only shows the rows of the current organization', async () => {
    const acme = aUser()
    const globex = aUser()
    await aBoardOf(acme)
    await aBoardOf(aB2cUser())

    expect(await boardsSeenBy(globex)).toEqual([])
    expect(await boardsSeenBy(acme)).toEqual([
      { organizationId: acme.organizationId }
    ])
  })

  it('refuses to write a row for another organization', async () => {
    const acme = aUser()
    const globex = aUser()

    await expect(
      inTenant(db, acme, tx => tx.insert(boards).values(aBoardRow(globex)))
    ).rejects.toThrow()
    await expect(
      inTenant(db, aB2cUser(), tx => tx.insert(boards).values(aBoardRow(acme)))
    ).rejects.toThrow()
  })

  it('keeps B2C users to the boards they belong to', async () => {
    const alice = aB2cUser()
    const bob = aB2cUser()
    const boardId = await aBoardOf(alice)

    expect(await boardsSeenBy(alice)).toEqual([{ organizationId: null }])
    expect(await boardsSeenBy(bob)).toEqual([])
    expect(
      await inTenant(db, bob, tx =>
        tx.select().from(sections).where(eq(sections.boardId, boardId))
      )
    ).toEqual([])
    await expect(
      inTenant(db, bob, tx =>
        tx.insert(boardMembers).values({
          boardId,
          organizationId: null,
          userId: bob.userId,
          email: bob.email,
          role: 'admin'
        })
      )
    ).rejects.toThrow()
  })

  it('shows a shared B2C board to its members', async () => {
    const alice = aB2cUser()
    const bob = aB2cUser()
    const boardId = await aBoardOf(alice)
    await inTenant(db, alice, tx =>
      tx.insert(boardMembers).values({
        boardId,
        organizationId: null,
        userId: bob.userId,
        email: bob.email,
        role: 'viewer'
      })
    )

    expect(await boardsSeenBy(bob)).toEqual([{ organizationId: null }])
    expect(
      await inTenant(db, bob, tx =>
        tx
          .select({ email: boardMembers.email })
          .from(boardMembers)
          .where(eq(boardMembers.boardId, boardId))
      )
    ).toHaveLength(2)
  })

  it('keeps each person’s favorites to themselves', async () => {
    const alice = aUser()
    const bob = aUser({ organizationId: alice.organizationId })
    const boardId = await aBoardOf(alice)
    const favorite = (user: TestUser) => ({
      boardId,
      organizationId: alice.organizationId,
      userId: user.userId
    })
    await inTenant(db, alice, async tx => {
      await tx.insert(boardMembers).values({
        boardId,
        organizationId: alice.organizationId,
        userId: bob.userId,
        email: bob.email,
        role: 'viewer'
      })
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
  const stray: Record<string, (boardId: string, taskId: string) => SQL> = {
    board_members: boardId =>
      statement`insert into board_members (board_id, org_id, user_id, email, role)
         values (${boardId}, null, uuidv7(), 'stray@example.com', 'viewer')`,
    sections: boardId =>
      statement`insert into sections (board_id, org_id, name, category, position)
         values (${boardId}, null, 'Stray', 'unstarted', 'z0')`,
    tasks: boardId =>
      statement`insert into tasks (board_id, org_id, number, title, position, created_by)
         values (${boardId}, null, 99, 'Stray', 'z0', uuidv7())`,
    board_favorites: boardId =>
      statement`insert into board_favorites (board_id, org_id, user_id)
         values (${boardId}, null, uuidv7())`,
    task_assignees: (_, taskId) =>
      statement`insert into task_assignees (task_id, org_id, user_id)
         values (${taskId}, null, uuidv7())`
  }

  // Row level security already refuses these, so it is lifted to reach the keys.
  it.each(Object.entries(stray))(
    'refuses a B2C row in %s on an organization board',
    async (table, insert) => {
      const owner = aUser()
      const boardId = await aBoardOf(owner)
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
          await tx.execute(insert(boardId, task?.id ?? ''))
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
})
