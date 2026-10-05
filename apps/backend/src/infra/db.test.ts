import { afterAll, describe, expect, inject, it } from 'vitest'
import { boards } from '../modules/boards/schema.ts'
import { aUser } from '../testing/app.ts'
import { assertRowLevelSecurity, createDb, inTenant } from './db.ts'

const { sql, db } = createDb(inject('databaseUrl'))

afterAll(async () => {
  await sql.end()
})

function aBoardRow(organizationId: string | null) {
  const owner = aUser({ organizationId })
  return {
    organizationId,
    ownerEmail: owner.email,
    name: 'Secret',
    keyPrefix: 'SEC',
    createdBy: owner.email
  }
}

describe('inTenant', () => {
  it('only shows the rows of the current organization', async () => {
    const acme = aUser().organizationId
    const globex = aUser().organizationId
    await inTenant(db, acme, tx => tx.insert(boards).values(aBoardRow(acme)))
    await inTenant(db, null, tx => tx.insert(boards).values(aBoardRow(null)))

    const seenBy = (organization: string | null) =>
      inTenant(db, organization, tx =>
        tx.select({ organizationId: boards.organizationId }).from(boards)
      )

    expect(await seenBy(globex)).toEqual([])
    expect(await seenBy(acme)).toEqual([{ organizationId: acme }])
    expect((await seenBy(null)).every(row => row.organizationId === null)).toBe(
      true
    )
  })

  it('refuses to write a row for another organization', async () => {
    const acme = aUser().organizationId
    const globex = aUser().organizationId

    await expect(
      inTenant(db, acme, tx => tx.insert(boards).values(aBoardRow(globex)))
    ).rejects.toThrow()
    await expect(
      inTenant(db, null, tx => tx.insert(boards).values(aBoardRow(acme)))
    ).rejects.toThrow()
  })
})

describe('assertRowLevelSecurity', () => {
  it('accepts the app role, which is not a superuser', async () => {
    await expect(assertRowLevelSecurity(sql)).resolves.toBeUndefined()
  })
})
