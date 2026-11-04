import {
  Clock,
  Comment,
  History,
  People,
  Reply,
  WarningCircle
} from '@linagora/twake-icons'
import {
  Box,
  Button,
  MenuItem,
  Select,
  Switch,
  Typography,
  useAlert
} from '@linagora/twake-mui'
import { useId, type ReactElement } from 'react'

import type {
  NotificationKind,
  NotificationPreferences
} from '@/application/boards'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { PageHeader } from '@/ds/PageHeader'
import { SettingsRow, SettingsTable } from '@/ds/SettingsTable'
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
  const headingId = useId()
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
    <Box component="section" id="notifications" aria-labelledby={headingId}>
      <PageHeader
        title={
          <>
            <Typography id={headingId} variant="h5" component="h2">
              {t('notificationSettings.title')}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {t('notificationSettings.hint')}
            </Typography>
          </>
        }
      />
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
        <SettingsTable
          headings={[
            t('notificationSettings.inApp'),
            t('notificationSettings.byEmail')
          ]}
        >
          {KINDS.map(([kind, icon]) => {
            const label = t(`notificationSettings.kinds.${kind}`)
            const inApp = !kept.mutedInApp.includes(kind)
            return (
              <SettingsRow
                key={kind}
                icon={icon}
                label={label}
                hint={!inApp && t('notificationSettings.inAppFirst')}
                paired
              >
                <Switch
                  checked={inApp}
                  slotProps={{
                    input: {
                      'aria-label': t('notificationSettings.inAppOf', {
                        kind: label
                      })
                    }
                  }}
                  onChange={(_event, on) => {
                    save({
                      ...kept,
                      mutedInApp: on
                        ? without(kept.mutedInApp, kind)
                        : [...kept.mutedInApp, kind],
                      mutedEmail: on
                        ? without(kept.mutedEmail, kind)
                        : kept.mutedEmail
                    })
                  }}
                />
                <Switch
                  checked={inApp && !kept.mutedEmail.includes(kind)}
                  disabled={!inApp}
                  slotProps={{
                    input: {
                      'aria-label': t('notificationSettings.byEmailOf', {
                        kind: label
                      })
                    }
                  }}
                  onChange={(_event, on) => {
                    save({
                      ...kept,
                      mutedEmail: on
                        ? without(kept.mutedEmail, kind)
                        : [...kept.mutedEmail, kind]
                    })
                  }}
                />
              </SettingsRow>
            )
          })}
          <SettingsRow
            label={t('notificationSettings.frequency')}
            labelId={frequencyId}
            hint={t('notificationSettings.frequencyHint')}
          >
            <Select
              size="small"
              value={kept.emailFrequency}
              inputProps={{ 'aria-labelledby': frequencyId }}
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
        </SettingsTable>
      )}
    </Box>
  )
}
