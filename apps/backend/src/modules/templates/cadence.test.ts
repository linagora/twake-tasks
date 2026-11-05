import { describe, expect, it } from 'vitest'
import { instantIn, nextRun, type Cadence } from './cadence.ts'

const daily: Cadence = {
  rule: { kind: 'daily', every: 1 },
  time: '08:00',
  zone: 'Europe/Paris',
  workingDays: false,
  startsOn: '2027-01-04',
  endsOn: null
}

const next = (cadence: Partial<Cadence>, after: string) =>
  nextRun({ ...daily, ...cadence }, new Date(after))?.toISOString() ?? null

describe('the next run of a schedule', () => {
  it('keeps its wall clock time when the clocks change', () => {
    expect(next({}, '2027-03-26T12:00:00Z')).toBe('2027-03-27T07:00:00.000Z')
    expect(next({}, '2027-03-27T12:00:00Z')).toBe('2027-03-28T06:00:00.000Z')
    expect(next({}, '2027-10-30T12:00:00Z')).toBe('2027-10-31T07:00:00.000Z')
  })

  it('runs later today when its time has not come yet', () => {
    expect(next({}, '2027-03-26T06:59:00Z')).toBe('2027-03-26T07:00:00.000Z')
    expect(next({}, '2027-03-26T07:00:00Z')).toBe('2027-03-27T07:00:00.000Z')
  })

  it('counts the day in its own zone', () => {
    expect(
      next({ zone: 'Pacific/Auckland', time: '09:00' }, '2027-01-10T23:00:00Z')
    ).toBe('2027-01-11T20:00:00.000Z')
  })

  it('moves a time the clocks skip an hour later, and runs a repeated time once', () => {
    expect(instantIn('2027-03-28', '02:30', 'Europe/Paris').toISOString()).toBe(
      '2027-03-28T01:30:00.000Z'
    )
    expect(instantIn('2027-10-31', '02:30', 'Europe/Paris').toISOString()).toBe(
      '2027-10-31T00:30:00.000Z'
    )
    expect(next({ time: '02:30' }, '2027-10-31T00:30:00Z')).toBe(
      '2027-11-01T01:30:00.000Z'
    )
  })

  it('skips the weekend on working days only', () => {
    expect(next({ workingDays: true }, '2027-03-26T12:00:00Z')).toBe(
      '2027-03-29T06:00:00.000Z'
    )
  })

  it('counts every N working days', () => {
    // Monday 4, then Wednesday 6, Friday 8 and Tuesday 12.
    const everyOther = {
      rule: { kind: 'daily', every: 2 },
      workingDays: true
    } as const
    expect(next(everyOther, '2027-01-08T12:00:00Z')).toBe(
      '2027-01-12T07:00:00.000Z'
    )
  })

  it('counts every N days from the day the rule was set', () => {
    expect(
      next({ rule: { kind: 'daily', every: 3 } }, '2027-01-05T12:00:00Z')
    ).toBe('2027-01-07T07:00:00.000Z')
  })

  it('runs on the chosen weekdays of every N weeks', () => {
    const rule = { kind: 'weekly' as const, every: 2, weekdays: [1, 4] }
    expect(next({ rule }, '2027-01-04T12:00:00Z')).toBe(
      '2027-01-07T07:00:00.000Z'
    )
    expect(next({ rule }, '2027-01-07T12:00:00Z')).toBe(
      '2027-01-18T07:00:00.000Z'
    )
  })

  it('falls on the last day of a month too short for its day', () => {
    const rule = { kind: 'monthly', every: 1, day: 31 } as const
    expect(next({ rule }, '2027-02-01T12:00:00Z')).toBe(
      '2027-02-28T07:00:00.000Z'
    )
    expect(
      next(
        { rule: { kind: 'monthly', every: 1, day: 'last' } },
        '2028-02-01T12:00:00Z'
      )
    ).toBe('2028-02-29T07:00:00.000Z')
  })

  it('runs every N months from the month the rule was set', () => {
    const rule = { kind: 'monthly', every: 3, day: 25 } as const
    expect(next({ rule }, '2027-01-26T12:00:00Z')).toBe(
      '2027-04-25T06:00:00.000Z'
    )
  })

  it('moves a monthly run off the weekend to the working day before', () => {
    const rule = { kind: 'monthly', every: 1, day: 1 } as const
    // May 1 2027 is a Saturday.
    expect(next({ rule, workingDays: true }, '2027-04-02T12:00:00Z')).toBe(
      '2027-04-30T06:00:00.000Z'
    )
  })

  it('runs a yearly date, on February 28 outside leap years', () => {
    const rule = { kind: 'yearly', month: 2, day: 29 } as const
    expect(next({ rule }, '2027-01-05T12:00:00Z')).toBe(
      '2027-02-28T07:00:00.000Z'
    )
    expect(next({ rule }, '2027-03-01T12:00:00Z')).toBe(
      '2028-02-29T07:00:00.000Z'
    )
  })

  it('ends after its end date', () => {
    expect(next({ endsOn: '2027-03-27' }, '2027-03-26T12:00:00Z')).toBe(
      '2027-03-27T07:00:00.000Z'
    )
    expect(next({ endsOn: '2027-03-27' }, '2027-03-27T12:00:00Z')).toBeNull()
  })
})
