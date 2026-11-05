import {
  Bell,
  Clock,
  Comment,
  Email,
  History,
  People,
  Reply,
  WarningCircle
} from '@linagora/twake-icons'
import { Button, MenuItem, Select, useAlert } from '@linagora/twake-mui'
import { useId, type ReactElement } from 'react'

import type {
  NotificationKind,
  NotificationPreferences
} from '@/application/boards'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { SettingsCard, ToggleChip, ToggleChips } from '@/ds/SettingsCard'
import { SettingsRow } from '@/ds/SettingsTable'
import { useI18n } from '@/ui/i18n/useI18n'
import {
  useKeepNotificationPreferences,
  useNotificationPreferences
} from '@/ui/queries/notifications'

const KINDS = [
  ['assigned', People],
  ['mentioned', Comment],
  ['reminder', Clock],
  ['changes', History],
  ['comments', Reply]
] as const satisfies readonly (readonly [NotificationKind, unknown])[]

const FREQUENCIES = ['instant', 'daily', 'never'] as const

const isFrequency = (
  value: string
): value is NotificationPreferences['emailFrequency'] =>
  (FREQUENCIES as readonly string[]).includes(value)

const without = (kinds: NotificationKind[], kind: NotificationKind) =>
  kinds.filter(each => each !== kind)

export function NotificationSettings(): ReactElement {
  const { t } = useI18n()
  const frequencyId = useId()
  const preferences = useNotificationPreferences()
  const keep = useKeepNotificationPreferences()
  const { showAlert } = useAlert()
  const kept = preferences.data

  const save = (next: NotificationPreferences) => {
    keep.mutate(next, {
      onSuccess: () => {
        showAlert({
          message: t('notificationSettings.saved'),
          severity: 'success'
        })
      },
      onError: () => {
        showAlert({
          message: t('notificationSettings.saveFailed'),
          severity: 'error'
        })
      }
    })
  }

  return (
    <SettingsCard
      id="notifications"
      icon={Bell}
      title={t('notificationSettings.title')}
      hint={t('notificationSettings.hint')}
    >
      {preferences.isError && (
        <EmptyState
          tone="error"
          icon={WarningCircle}
          title={t('notificationSettings.loadFailed')}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void preferences.refetch()
              }}
            >
              {t('session.retry')}
            </Button>
          }
        />
      )}
      {preferences.isPending && (
        <ListSkeleton label={t('app.loading')} rows={3} />
      )}
      {kept && (
        <>
          {KINDS.map(([kind, icon]) => {
            const label = t(`notificationSettings.kinds.${kind}`)
            const inApp = !kept.mutedInApp.includes(kind)
            const byEmail = inApp && !kept.mutedEmail.includes(kind)
            return (
              <SettingsRow
                key={kind}
                icon={icon}
                label={label}
                hint={!inApp && t('notificationSettings.inAppFirst')}
              >
                <ToggleChips>
                  <ToggleChip
                    label={t('notificationSettings.inApp')}
                    name={t('notificationSettings.inAppOf', { kind: label })}
                    pressed={inApp}
                    onClick={() => {
                      save({
                        ...kept,
                        mutedInApp: inApp
                          ? [...kept.mutedInApp, kind]
                          : without(kept.mutedInApp, kind),
                        mutedEmail: inApp
                          ? kept.mutedEmail
                          : without(kept.mutedEmail, kind)
                      })
                    }}
                  />
                  <ToggleChip
                    label={t('notificationSettings.byEmail')}
                    name={t('notificationSettings.byEmailOf', { kind: label })}
                    pressed={byEmail}
                    disabled={!inApp}
                    onClick={() => {
                      save({
                        ...kept,
                        mutedEmail: byEmail
                          ? [...kept.mutedEmail, kind]
                          : without(kept.mutedEmail, kind)
                      })
                    }}
                  />
                </ToggleChips>
              </SettingsRow>
            )
          })}
          <SettingsRow
            icon={Email}
            label={t('notificationSettings.frequency')}
            labelId={frequencyId}
            hint={t('notificationSettings.frequencyHint')}
          >
            <Select
              size="small"
              value={kept.emailFrequency}
              labelId={frequencyId}
              onChange={event => {
                if (isFrequency(event.target.value)) {
                  save({ ...kept, emailFrequency: event.target.value })
                }
              }}
            >
              {FREQUENCIES.map(frequency => (
                <MenuItem key={frequency} value={frequency}>
                  {t(`notificationSettings.frequencies.${frequency}`)}
                </MenuItem>
              ))}
            </Select>
          </SettingsRow>
        </>
      )}
    </SettingsCard>
  )
}
