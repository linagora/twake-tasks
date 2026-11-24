import type { DueRule, ScheduleSettings } from '@/domain/board'
import { formatDay, localZone } from '@/ui/boards/dueLabel'
import type { useI18n } from '@/ui/i18n/useI18n'

type Translate = ReturnType<typeof useI18n>['t']

// January 1 2024 was a Monday, so weekday 1 is the 1st.
export const weekdayName = (
  weekday: number,
  lang: string,
  width: 'long' | 'short' = 'long'
): string =>
  new Intl.DateTimeFormat(lang, { weekday: width, timeZone: 'UTC' }).format(
    Date.UTC(2024, 0, weekday)
  )

export const monthName = (month: number, lang: string): string =>
  new Intl.DateTimeFormat(lang, { month: 'long', timeZone: 'UTC' }).format(
    Date.UTC(2024, month - 1, 1)
  )

function dueSummary(t: Translate, due: DueRule): string {
  const later = { smart_count: due.after }
  let summary: string
  switch (due.kind) {
    case 'days':
      summary =
        due.after === 0
          ? t('templates.schedule.summary.due.sameDay')
          : t('templates.schedule.summary.due.days', later)
      break
    case 'monthDay': {
      const last = due.day === 'last'
      if (due.after === 0) {
        summary = last
          ? t('templates.schedule.summary.due.monthLast')
          : t('templates.schedule.summary.due.monthDay', { day: due.day })
      } else {
        summary = last
          ? t('templates.schedule.summary.due.monthLastLater', later)
          : t('templates.schedule.summary.due.monthDayLater', {
              ...later,
              day: due.day
            })
      }
      break
    }
    case 'quarterEnd':
      summary =
        due.after === 0
          ? t('templates.schedule.summary.due.quarterEnd')
          : t('templates.schedule.summary.due.quarterEndLater', later)
  }
  return due.time
    ? t('templates.schedule.summary.due.at', { due: summary, time: due.time })
    : summary
}

/** "Every working day at 08:00", with the zone when the reader is elsewhere. */
export function scheduleSummary(
  t: Translate,
  lang: string,
  schedule: Pick<
    ScheduleSettings,
    'rule' | 'time' | 'zone' | 'workingDays' | 'endsOn' | 'due'
  >
): string {
  const { rule, workingDays } = schedule
  const time =
    schedule.zone === localZone()
      ? schedule.time
      : `${schedule.time} ${schedule.zone}`
  const every = { smart_count: rule.kind === 'yearly' ? 1 : rule.every, time }
  let summary: string
  switch (rule.kind) {
    case 'daily':
      summary = t(
        workingDays
          ? 'templates.schedule.summary.workingDaily'
          : 'templates.schedule.summary.daily',
        every
      )
      break
    case 'weekly':
      summary = t('templates.schedule.summary.weekly', {
        ...every,
        days: new Intl.ListFormat(lang).format(
          rule.weekdays.map(weekday => weekdayName(weekday, lang))
        )
      })
      break
    case 'monthly':
      summary =
        rule.day === 'last'
          ? t('templates.schedule.summary.monthlyLast', every)
          : t('templates.schedule.summary.monthly', { ...every, day: rule.day })
      break
    case 'yearly':
      summary = t('templates.schedule.summary.yearly', {
        time,
        date: new Intl.DateTimeFormat(lang, {
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC'
        }).format(Date.UTC(2024, rule.month - 1, rule.day))
      })
  }
  if (workingDays && (rule.kind === 'monthly' || rule.kind === 'yearly')) {
    summary = t('templates.schedule.summary.workingBefore', { summary })
  }
  if (schedule.due) {
    summary = t('templates.schedule.summary.withDue', {
      summary,
      due: dueSummary(t, schedule.due)
    })
  }
  return schedule.endsOn
    ? t('templates.schedule.summary.until', {
        summary,
        date: formatDay(schedule.endsOn, lang)
      })
    : summary
}
