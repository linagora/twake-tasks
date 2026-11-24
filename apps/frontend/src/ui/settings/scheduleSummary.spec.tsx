import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { ScheduleSettings } from '@/domain/board'
import { followZone } from '@/ui/boards/dueLabel'
import { I18nProvider } from '@/ui/i18n/I18nProvider'
import type { SupportedLanguage } from '@/ui/i18n/languages'
import { useI18n } from '@/ui/i18n/useI18n'
import { scheduleSummary } from '@/ui/settings/scheduleSummary'

const summaryIn = (
  lang: SupportedLanguage,
  schedule: Partial<ScheduleSettings>
) => {
  const { result } = renderHook(() => useI18n(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <I18nProvider lang={lang}>{children}</I18nProvider>
    )
  })
  return scheduleSummary(result.current.t, lang, {
    rule: { kind: 'daily', every: 1 },
    time: '08:00',
    zone: 'Europe/Paris',
    workingDays: false,
    endsOn: null,
    due: null,
    ...schedule
  })
}

describe('scheduleSummary', () => {
  afterEach(() => {
    followZone(null)
  })

  it.each<{ schedule: Partial<ScheduleSettings>; shown: string }>([
    {
      schedule: { workingDays: true },
      shown: 'Tous les jours ouvrés à 08:00'
    },
    {
      schedule: { rule: { kind: 'monthly', every: 1, day: 25 } },
      shown: 'Le 25 de chaque mois à 08:00'
    },
    {
      schedule: { rule: { kind: 'weekly', every: 2, weekdays: [1, 4] } },
      shown: 'Toutes les 2 semaines le lundi et jeudi à 08:00'
    },
    {
      schedule: {
        rule: { kind: 'monthly', every: 1, day: 'last' },
        workingDays: true
      },
      shown: 'Le dernier jour de chaque mois à 08:00, ou le jour ouvré d’avant'
    },
    {
      schedule: {
        rule: { kind: 'yearly', month: 12, day: 25 },
        endsOn: '2030-01-01'
      },
      shown: 'Chaque année le 25 décembre à 08:00, jusqu’au 1 janv. 2030'
    },
    {
      schedule: {
        rule: { kind: 'monthly', every: 1, day: 25 },
        due: { kind: 'monthDay', after: 1, day: 5, time: null }
      },
      shown: 'Le 25 de chaque mois à 08:00, échéance le 5, 1 mois après'
    },
    {
      schedule: { due: { kind: 'days', after: 0, time: '18:00' } },
      shown: 'Tous les jours à 08:00, échéance le jour même à 18:00'
    },
    {
      schedule: { due: { kind: 'quarterEnd', after: 0, time: null } },
      shown: 'Tous les jours à 08:00, échéance en fin de trimestre'
    }
  ])('reads $shown', ({ schedule, shown }) => {
    followZone('Europe/Paris')

    expect(summaryIn('fr', schedule)).toBe(shown)
  })

  it('names the zone when the reader is elsewhere', () => {
    followZone('America/New_York')

    expect(summaryIn('en', { rule: { kind: 'daily', every: 3 } })).toBe(
      'Every 3 days at 08:00 Europe/Paris'
    )
  })
})
