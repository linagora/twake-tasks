import { describe, expect, it, vi } from 'vitest'
import type { DueRule } from '@twake-tasks/api-contract'
import { dueOf, instantIn, nextRun, type Cadence } from './cadence.ts'

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

  it('reads the zone offset only twice away from a clock change', () => {
    const format = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts')
    try {
      expect(
        instantIn('2027-06-15', '09:00', 'Europe/Paris').toISOString()
      ).toBe('2027-06-15T07:00:00.000Z')
      expect(format).toHaveBeenCalledTimes(2)
    } finally {
      format.mockRestore()
    }
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

  it('runs every 365 working days, 73 weeks later', () => {
    const yearly = {
      rule: { kind: 'daily', every: 365 },
      workingDays: true
    } as const
    expect(next(yearly, '2027-01-04T12:00:00Z')).toBe(
      '2028-05-29T06:00:00.000Z'
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

describe('the due date of a run', () => {
  // 00:30 on January 1 in Paris is still December 31 in UTC.
  const run = new Date('2026-12-31T23:30:00Z')
  const due = (rule: DueRule) => dueOf(rule, run, 'Europe/Paris')

  it('counts days from the day of the run, in its zone', () => {
    expect(due({ kind: 'days', after: 0, time: '18:00' })).toEqual({
      dueDate: '2027-01-01',
      dueTime: '18:00',
      dueZone: 'Europe/Paris'
    })
    expect(due({ kind: 'days', after: 10, time: null })).toEqual({
      dueDate: '2027-01-11',
      dueTime: null,
      dueZone: null
    })
  })

  it('falls on a day of the month N months later, or on its last day', () => {
    const report = new Date('2027-01-25T07:00:00Z')
    expect(
      dueOf({ kind: 'monthDay', after: 1, day: 5, time: null }, report, 'UTC')
        .dueDate
    ).toBe('2027-02-05')
    expect(
      due({ kind: 'monthDay', after: 1, day: 31, time: null }).dueDate
    ).toBe('2027-02-28')
    expect(
      due({ kind: 'monthDay', after: 0, day: 'last', time: null }).dueDate
    ).toBe('2027-01-31')
    expect(
      due({ kind: 'monthDay', after: 4, day: 15, time: null }).dueDate
    ).toBe('2027-05-15')
  })

  it('falls on the last day of the quarter N quarters later', () => {
    expect(due({ kind: 'quarterEnd', after: 0, time: null }).dueDate).toBe(
      '2027-03-31'
    )
    expect(due({ kind: 'quarterEnd', after: 4, time: null }).dueDate).toBe(
      '2028-03-31'
    )
  })
})
