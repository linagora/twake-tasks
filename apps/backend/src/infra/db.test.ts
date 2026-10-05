import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, inject, it } from 'vitest'
import { boardMembers, boards, sections } from '../modules/boards/schema.ts'
import { aB2cUser, aUser, type TestUser } from '../testing/app.ts'
import { assertRowLevelSecurity, createDb, inTenant } from './db.ts'

const { sql, db } = createDb(inject('databaseUrl'))

afterAll(async () => {
  await sql.end()
})

function aBoardRow(owner: TestUser) {
  return {
    organizationId: owner.organizationId,
    ownerEmail: owner.email,
    name: 'Secret',
    keyPrefix: 'SEC',
    createdBy: owner.email
  }
}

async function aBoardOf(owner: TestUser) {
  return inTenant(db, owner, async tx => {
    const [board] = await tx.insert(boards).values(aBoardRow(owner)).returning()
    if (!board) throw new Error('no board')
    await tx.insert(boardMembers).values({
      boardId: board.id,
      organizationId: owner.organizationId,
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
})

describe('assertRowLevelSecurity', () => {
  it('accepts the app role, which is not a superuser', async () => {
    await expect(assertRowLevelSecurity(sql)).resolves.toBeUndefined()
  })
})
