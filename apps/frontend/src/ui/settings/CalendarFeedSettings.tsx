import {
  Calendar,
  Copy,
  Link,
  Refresh,
  WarningCircle
} from '@linagora/twake-icons'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  TextField,
  Typography,
  useAlert
} from '@linagora/twake-mui'
import { useId, useState, type FocusEvent, type ReactElement } from 'react'

import type { CalendarFeedScope } from '@/application/boards'
import { ClosableTitle } from '@/ds/ClosableTitle'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { Icon } from '@/ds/Icon'
import { PageHeader } from '@/ds/PageHeader'
import { SettingsActions, SettingsRow, SettingsTable } from '@/ds/SettingsTable'
import { momentFormat } from '@/ui/boards/dueLabel'
import { useI18n } from '@/ui/i18n/useI18n'
import {
  useCalendarFeed,
  useChangeCalendarFeed,
  useCloseCalendarFeed,
  useOpenCalendarFeed
} from '@/ui/queries/calendarFeed'

const SCOPES = ['assigned', 'mine'] as const

const isScope = (value: string): value is CalendarFeedScope =>
  (SCOPES as readonly string[]).includes(value)

export function CalendarFeedSettings(): ReactElement {
  const { t } = useI18n()
  const headingId = useId()

  return (
    <Box component="section" id="calendar" aria-labelledby={headingId}>
      <PageHeader
        title={
          <>
            <Typography id={headingId} variant="h5" component="h2">
              {t('calendarFeed.title')}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {t('calendarFeed.hint')}
            </Typography>
          </>
        }
      />
      <CalendarFeedControls />
    </Box>
  )
}

/** From My tasks, the same settings without leaving the page. */
export function CalendarFeedDialog({
  onClose
}: {
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="medium">
      <ClosableTitle
        id={titleId}
        title={t('calendarFeed.title')}
        closeLabel={t('calendarFeed.close')}
        onClose={onClose}
      />
      <DialogContent>
        <Typography variant="body2" color="textSecondary" className="u-mb-1">
          {t('calendarFeed.hint')}
        </Typography>
        <CalendarFeedControls />
      </DialogContent>
    </Dialog>
  )
}

function CalendarFeedControls(): ReactElement {
  const { t, lang } = useI18n()
  const scopeId = useId()
  const linkId = useId()
  const feed = useCalendarFeed()
  const open = useOpenCalendarFeed()
  const change = useChangeCalendarFeed()
  const { showAlert } = useAlert()
  const [chosen, setChosen] = useState<CalendarFeedScope>('assigned')
  const [ending, setEnding] = useState<'reset' | 'off' | null>(null)
  const kept = feed.data
  // The link is known only to the answer that made it.
  const url =
    kept && open.data?.createdAt === kept.createdAt ? open.data.url : null
  const failed = () => {
    showAlert({ message: t('calendarFeed.failed'), severity: 'error' })
  }
  const create = () => {
    open.mutate(kept?.scope ?? chosen, { onError: failed })
  }

  if (feed.isError) {
    return (
      <EmptyState
        tone="error"
        icon={WarningCircle}
        title={t('calendarFeed.loadFailed')}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void feed.refetch()
            }}
          >
            {t('session.retry')}
          </Button>
        }
      />
    )
  }
  if (kept === undefined) {
    return <ListSkeleton label={t('app.loading')} rows={2} />
  }

  return (
    <SettingsTable>
      <SettingsRow
        icon={Calendar}
        label={t('calendarFeed.scope')}
        labelId={scopeId}
      >
        <Select
          size="small"
          value={kept?.scope ?? chosen}
          labelId={scopeId}
          onChange={event => {
            const scope = event.target.value
            if (!isScope(scope)) return
            if (kept) change.mutate(scope, { onError: failed })
            else setChosen(scope)
          }}
        >
          {SCOPES.map(scope => (
            <MenuItem key={scope} value={scope}>
              {t(`calendarFeed.scopes.${scope}`)}
            </MenuItem>
          ))}
        </Select>
      </SettingsRow>
      {url ? (
        <NewLink url={url} labelId={linkId} />
      ) : (
        <SettingsRow
          icon={Link}
          label={t('calendarFeed.link')}
          labelId={linkId}
          hint={
            kept
              ? t('calendarFeed.active', {
                  date: momentFormat(lang).format(new Date(kept.createdAt))
                })
              : t('calendarFeed.privacy')
          }
        >
          {kept ? (
            <SettingsActions>
              <Button
                variant="secondary"
                startIcon={<Icon icon={Refresh} />}
                disabled={open.isPending}
                onClick={() => {
                  setEnding('reset')
                }}
              >
                {t('calendarFeed.reset')}
              </Button>
              <Button
                variant="text"
                color="error"
                onClick={() => {
                  setEnding('off')
                }}
              >
                {t('calendarFeed.turnOff')}
              </Button>
            </SettingsActions>
          ) : (
            <Button disabled={open.isPending} onClick={create}>
              {t('calendarFeed.create')}
            </Button>
          )}
        </SettingsRow>
      )}
      {ending && (
        <EndLinkDialog
          ending={ending}
          onReset={create}
          onClose={() => {
            setEnding(null)
          }}
        />
      )}
    </SettingsTable>
  )
}

function NewLink({
  url,
  labelId
}: {
  url: string
  labelId: string
}): ReactElement {
  const { t } = useI18n()
  const { showAlert } = useAlert()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      showAlert({ message: t('calendarFeed.copied'), severity: 'success' })
    } catch {
      showAlert({ message: t('calendarFeed.copyFailed'), severity: 'error' })
    }
  }

  return (
    <SettingsRow
      icon={Link}
      label={t('calendarFeed.link')}
      labelId={labelId}
      hint={t('calendarFeed.shownOnce')}
      stacked
    >
      <TextField
        value={url}
        size="small"
        fullWidth
        slotProps={{
          htmlInput: {
            readOnly: true,
            'aria-labelledby': labelId,
            onFocus: (event: FocusEvent<HTMLInputElement>) => {
              event.target.select()
            }
          }
        }}
      />
      <SettingsActions>
        <Button
          startIcon={<Icon icon={Copy} />}
          onClick={() => {
            void copy()
          }}
        >
          {t('calendarFeed.copy')}
        </Button>
        {/* webcal: hands the link to the calendar app the system offers. */}
        <Button
          variant="secondary"
          startIcon={<Icon icon={Calendar} />}
          href={url.replace(/^https?:/, 'webcal:')}
        >
          {t('calendarFeed.openInApp')}
        </Button>
      </SettingsActions>
    </SettingsRow>
  )
}

function EndLinkDialog({
  ending,
  onReset,
  onClose
}: {
  ending: 'reset' | 'off'
  onReset: () => void
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const close = useCloseCalendarFeed()
  const { showAlert } = useAlert()
  const end = () => {
    if (ending === 'reset') {
      onReset()
      onClose()
      return
    }
    close.mutate(undefined, {
      onSuccess: onClose,
      onError: () => {
        showAlert({ message: t('calendarFeed.failed'), severity: 'error' })
      }
    })
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <form
        onSubmit={event => {
          event.preventDefault()
          end()
        }}
      >
        <DialogTitle id={titleId}>
          {t(
            ending === 'reset'
              ? 'calendarFeed.resetTitle'
              : 'calendarFeed.turnOffTitle'
          )}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t(
              ending === 'reset'
                ? 'calendarFeed.resetHint'
                : 'calendarFeed.turnOffHint'
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={onClose}>
            {t('board.cancel')}
          </Button>
          <Button
            type="submit"
            color={ending === 'reset' ? 'primary' : 'error'}
            disabled={close.isPending}
          >
            {t(
              ending === 'reset' ? 'calendarFeed.reset' : 'calendarFeed.turnOff'
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
