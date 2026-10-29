import { describe, expect, it } from 'vitest'
import { uncontracted } from './checkMigrations.ts'

const breakpoint = '--> statement-breakpoint\n'

describe('uncontracted', () => {
  it.each([
    'ALTER TABLE "tasks" DROP COLUMN "due";',
    'DROP TABLE "label_merges";',
    'ALTER TABLE "boards" RENAME COLUMN "name" TO "title";',
    'ALTER TABLE "tasks" ALTER COLUMN "due" SET NOT NULL;',
    'ALTER TABLE "people" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;',
    'ALTER TABLE "jobs" ADD COLUMN "user_id" uuid NOT NULL;',
    'ALTER TABLE "jobs" ADD COLUMN "cost" numeric(10, 2) NOT NULL;',
    'ALTER TABLE "jobs" ADD COLUMN "default" text NOT NULL;',
    'ALTER TABLE "jobs" ALTER COLUMN "tries" DROP DEFAULT;'
  ])('refuses %s without a contract marker', statement => {
    expect(uncontracted(statement, '0.2.20')).toEqual([statement])
  })

  it.each([
    'ALTER TABLE "jobs" ADD COLUMN "user_id" uuid;',
    'ALTER TABLE "jobs" ADD COLUMN "tries" integer DEFAULT 0 NOT NULL;',
    'CREATE TABLE "x" ("id" uuid NOT NULL);',
    '-- the rows are renamed, not the columns\nUPDATE "boards" SET "key_prefix" = \'A2\';',
    'UPDATE "boards" SET "name" = \'rename me\';',
    'ALTER INDEX "a" RENAME TO "b";'
  ])('lets %s through', statement => {
    expect(uncontracted(statement, '0.2.20')).toEqual([])
  })

  it('lets a statement through behind a marker naming a released version', () => {
    const sql = [
      'ALTER TABLE "jobs" ADD COLUMN "user_id" uuid;',
      '-- contract: read from user_id since then, unused since backend 0.2.20\nALTER TABLE "jobs" DROP COLUMN "payload";'
    ].join(breakpoint)

    expect(uncontracted(sql, '0.2.20')).toEqual([])
  })

  it('refuses a marker naming a version not yet released', () => {
    const statement =
      '-- contract: read from user_id since then, unused since backend 0.2.21\nALTER TABLE "jobs" DROP COLUMN "payload";'

    expect(uncontracted(statement, '0.2.20')).toEqual([statement])
  })

  it('compares versions as numbers', () => {
    const statement =
      '-- contract: gone, unused since backend 0.2.9\nDROP TABLE "x";'

    expect(uncontracted(statement, '0.2.20')).toEqual([])
  })

  it('needs the marker in the statement it covers', () => {
    const drop = 'ALTER TABLE "jobs" DROP COLUMN "payload";'
    const sql = [
      '-- contract: gone, unused since backend 0.2.0\nDROP TABLE "x";',
      drop
    ].join(breakpoint)

    expect(uncontracted(sql, '0.2.20')).toEqual([drop])
  })
})
