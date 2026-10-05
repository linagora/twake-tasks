import { Button, IconButton, TextField, Typography } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import type { Task } from '@/domain/board'
import { localZone } from '@/ui/boards/dueLabel'
import {
  useAddReminder,
  useDeleteReminder,
  useReminders
} from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

const BEFORE = ['0', '15', '60', '1440', 'at'] as const
type Before = (typeof BEFORE)[number]

const HOUR = 60
const DAY = 24 * HOUR

export function Reminders({
  task,
  boardId
}: {
  task: Task
  boardId: string
}): ReactElement {
  const { t, lang } = useI18n()
  const reminders = useReminders(boardId, task.id)
  const add = useAddReminder(boardId, task.id)
  const remove = useDeleteReminder(boardId, task.id)
  const [before, setBefore] = useState<Before>('0')
  const [at, setAt] = useState('')
  const format = new Intl.DateTimeFormat(lang, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
  const fixed = task.dueDate === null || before === 'at'

  const beforeLabel = (minutes: number) => {
    if (minutes === 0) return t('reminders.atDue')
    if (minutes % DAY === 0) {
      return t('reminders.daysBefore', { smart_count: minutes / DAY })
    }
    if (minutes % HOUR === 0) {
      return t('reminders.hoursBefore', { smart_count: minutes / HOUR })
    }
    return t('reminders.minutesBefore', { smart_count: minutes })
  }

  return (
    <section aria-label={t('reminders.title')}>
      <Typography variant="h6">{t('reminders.title')}</Typography>
      {reminders.data?.length === 0 && (
        <Typography color="textSecondary">{t('reminders.none')}</Typography>
      )}
      <ul>
        {reminders.data?.map(reminder => (
          <li key={reminder.id}>
            {reminder.beforeMinutes === null
              ? format.format(new Date(reminder.at ?? ''))
              : beforeLabel(reminder.beforeMinutes)}
            <IconButton
              size="small"
              aria-label={t('reminders.delete')}
              onClick={() => {
                remove.mutate(reminder.id)
              }}
            >
              ×
            </IconButton>
          </li>
        ))}
      </ul>
      <form
        onSubmit={event => {
          event.preventDefault()
          add.mutate(
            fixed
              ? { at: new Date(at).toISOString() }
              : { beforeMinutes: Number(before), zone: localZone() },
            {
              onSuccess: () => {
                setAt('')
              }
            }
          )
        }}
      >
        {task.dueDate !== null && (
          <TextField
            select
            label={t('reminders.remindMe')}
            value={before}
            onChange={event => {
              setBefore(event.target.value as Before)
            }}
            margin="dense"
            slotProps={{ select: { native: true } }}
          >
            {BEFORE.map(value => (
              <option key={value} value={value}>
                {value === 'at'
                  ? t('reminders.setTime')
                  : beforeLabel(Number(value))}
              </option>
            ))}
          </TextField>
        )}
        {fixed && (
          <TextField
            type="datetime-local"
            label={t('reminders.at')}
            value={at}
            onChange={event => {
              setAt(event.target.value)
            }}
            margin="dense"
            slotProps={{ inputLabel: { shrink: true } }}
          />
        )}
        {add.isError && (
          <Typography role="alert" variant="caption">
            {t('reminders.failed')}
          </Typography>
        )}
        <Button
          type="submit"
          size="small"
          disabled={add.isPending || (fixed && !at)}
        >
          {t('reminders.add')}
        </Button>
      </form>
    </section>
  )
}
