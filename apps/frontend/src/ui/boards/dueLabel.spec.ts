import { afterEach, describe, expect, it, vi } from 'vitest'

import { followZone, localToday } from '@/ui/boards/dueLabel'

describe('localToday', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    followZone(null)
  })

  it('reads YYYY-MM-DD whatever the date pattern of the engine', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-13T08:00:00Z'))
    followZone('Europe/Paris')
    // WebKit's en-CA data formats a date as M/d/yyyy.
    class WebKitFormat extends Intl.DateTimeFormat {
      override format = () => '10/13/2026'
    }
    vi.stubGlobal('Intl', { DateTimeFormat: WebKitFormat })

    expect(localToday()).toBe('2026-10-13')
  })

  it('counts the day in the followed zone', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-13T23:30:00Z'))

    followZone('Europe/Paris')
    expect(localToday()).toBe('2026-10-14')
    followZone('America/New_York')
    expect(localToday()).toBe('2026-10-13')
  })
})
