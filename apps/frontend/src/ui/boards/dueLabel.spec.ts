import { afterEach, describe, expect, it, vi } from 'vitest'

import { followZone, localToday, relativeMoment } from '@/ui/boards/dueLabel'
import type { I18nApi } from '@/ui/i18n/useI18n'

describe('relativeMoment', () => {
  const t: I18nApi['t'] = (key, options = {}) =>
    [key, ...Object.values(options)].join(' ')
  const ago = (at: string) => relativeMoment(new Date(at), t, 'en')

  afterEach(() => {
    vi.useRealTimers()
    followZone(null)
  })

  it.each([
    { at: '2026-10-23T11:59:30Z', shown: 'notifications.justNow' },
    { at: '2026-10-23T11:18:00Z', shown: 'notifications.minutesAgo 42' },
    { at: '2026-10-23T08:05:00Z', shown: '08:05' },
    { at: '2026-10-22T14:05:00Z', shown: 'notifications.yesterdayAt 14:05' },
    { at: '2026-10-19T09:12:00Z', shown: 'Monday 09:12' },
    { at: '2026-10-16T09:12:00Z', shown: 'Oct 16, 2026, 09:12' }
  ])('shows $at as $shown at noon on Friday 23', ({ at, shown }) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-23T12:00:00Z'))
    followZone('UTC')

    expect(ago(at)).toBe(shown)
  })

  it('counts days in the followed zone', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-23T23:30:00Z'))
    followZone('Europe/Paris')

    expect(ago('2026-10-23T20:00:00Z')).toBe('notifications.yesterdayAt 22:00')
  })
})

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
