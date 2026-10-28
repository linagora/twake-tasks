import { describe, expect, it } from 'vitest'

import { addDays, reschedule } from '@/application/reschedule'

describe('reschedule', () => {
  it('gives an undated task the day', () => {
    expect(reschedule({ dueDate: null, deadline: null }, '2026-10-16')).toEqual(
      { dueDate: '2026-10-16' }
    )
  })

  it('moves the deadline by as many days as the due date', () => {
    expect(
      reschedule(
        { dueDate: '2026-10-25', deadline: '2026-10-27' },
        '2026-10-20'
      )
    ).toEqual({ dueDate: '2026-10-20', deadline: '2026-10-22' })
    expect(
      reschedule(
        { dueDate: '2026-10-30', deadline: '2026-11-02' },
        '2026-12-31'
      )
    ).toEqual({ dueDate: '2026-12-31', deadline: '2027-01-03' })
  })

  it('removes the due date and its time, and keeps the deadline', () => {
    expect(
      reschedule({ dueDate: '2026-10-25', deadline: '2026-10-27' }, null)
    ).toEqual({ dueDate: null, dueTime: null })
  })
})

describe('addDays', () => {
  it('crosses months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2027-01-03', -7)).toBe('2026-12-27')
  })
})
