import { Bell, CrossSmall, Icon, Plus } from '@linagora/twake-icons'
import {
  Button,
  Chip,
  IconButton,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import { Row } from '@/ds/Columns'
import { Chips } from '@/ds/SidePanel'
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
  const [open, setOpen] = useState(false)
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

  const close = () => {
    add.reset()
    setOpen(false)
  }

  return (
    <section aria-label={t('reminders.title')} className="u-w-100">
      <Row>
        {reminders.data && reminders.data.length > 0 ? (
          <Chips label={t('reminders.title')}>
            {reminders.data.map(reminder => (
              <li key={reminder.id}>
                <Chip
                  size="small"
                  icon={<Icon icon={Bell} size={12} />}
                  label={
                    reminder.beforeMinutes === null
                      ? format.format(new Date(reminder.at ?? ''))
                      : beforeLabel(reminder.beforeMinutes)
                  }
                />
                <IconButton
                  size="small"
                  aria-label={t('reminders.delete')}
                  onClick={() => {
                    remove.mutate(reminder.id)
                  }}
                >
                  <Icon icon={CrossSmall} size={12} />
                </IconButton>
              </li>
            ))}
          </Chips>
        ) : (
          !open && (
            <Typography variant="body2" color="textSecondary">
              {t('reminders.none')}
            </Typography>
          )
        )}
        {!open && (
          <IconButton
            size="small"
            aria-label={t('reminders.add')}
            onClick={() => {
              setOpen(true)
            }}
          >
            <Icon icon={Plus} size={14} />
          </IconButton>
        )}
      </Row>
      {open && (
        <form
          className="u-flex u-flex-items-center u-flex-wrap u-mt-half"
          onSubmit={event => {
            event.preventDefault()
            add.mutate(
              fixed
                ? { at: new Date(at).toISOString() }
                : { beforeMinutes: Number(before), zone: localZone() },
              {
                onSuccess: () => {
                  setAt('')
                  setOpen(false)
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
              size="small"
              className="u-mr-half u-mt-half"
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
              size="small"
              className="u-mr-half u-mt-half"
              slotProps={{ inputLabel: { shrink: true } }}
            />
          )}
          {add.isError && (
            <Typography role="alert" variant="caption">
              {t('reminders.failed')}
            </Typography>
          )}
          <Button
            variant="text"
            size="small"
            className="u-mt-half"
            onClick={close}
          >
            {t('board.cancel')}
          </Button>
          <Button
            type="submit"
            size="small"
            className="u-mt-half"
            disabled={add.isPending || (fixed && !at)}
          >
            {t('reminders.save')}
          </Button>
        </form>
      )}
    </section>
  )
}
