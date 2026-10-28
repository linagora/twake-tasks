import { describe, expect, it } from 'vitest'
import { nextOccurrence } from './recurrence.ts'

const rule = (every: number, unit: 'days' | 'weeks' | 'months' | 'years') => ({
  every,
  unit,
  fromCompletion: false
})

describe('nextOccurrence', () => {
  it('skips an overdue task to its first occurrence after today', () => {
    expect(nextOccurrence('2026-10-01', rule(3, 'days'), '2026-10-28')).toBe(
      '2026-10-31'
    )
    expect(nextOccurrence('2026-10-01', rule(3, 'days'), '2026-10-30')).toBe(
      '2026-10-31'
    )
    expect(nextOccurrence('2026-10-07', rule(2, 'weeks'), '2026-10-21')).toBe(
      '2026-11-04'
    )
    expect(nextOccurrence('2026-01-31', rule(1, 'months'), '2026-10-28')).toBe(
      '2026-10-31'
    )
    expect(nextOccurrence('2026-01-31', rule(1, 'months'), '2026-10-31')).toBe(
      '2026-11-30'
    )
    expect(nextOccurrence('2020-02-29', rule(1, 'years'), '2026-10-28')).toBe(
      '2027-02-28'
    )
  })

  it('moves a task due later by one period', () => {
    expect(nextOccurrence('2099-01-31', rule(1, 'months'), '2026-10-28')).toBe(
      '2099-02-28'
    )
  })

  it('skips centuries of periods without walking them', () => {
    const start = performance.now()

    expect(nextOccurrence('0000-01-01', rule(1, 'days'), '2026-10-28')).toBe(
      '2026-10-29'
    )
    expect(performance.now() - start).toBeLessThan(100)
  })

  it('refuses an occurrence after year 9999', () => {
    expect(() =>
      nextOccurrence('9999-12-31', rule(1, 'days'), '2026-10-28')
    ).toThrow(RangeError)
  })
})
