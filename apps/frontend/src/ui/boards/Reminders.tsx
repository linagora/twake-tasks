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
import { EditorActions, EditorPopover, MomentField } from '@/ds/Pickers'
import { Chips } from '@/ds/SidePanel'
import type { Task } from '@/domain/board'
import { localZone, zonedInstant } from '@/ui/boards/dueLabel'
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
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const shut = () => {
    setAnchor(null)
  }
  const format = new Intl.DateTimeFormat(lang, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: localZone()
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
    shut()
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
          <Typography variant="body2" color="textSecondary">
            {t('reminders.none')}
          </Typography>
        )}
        <IconButton
          size="small"
          aria-label={t('reminders.add')}
          onClick={event => {
            setAnchor(event.currentTarget)
          }}
        >
          <Icon icon={Plus} size={14} />
        </IconButton>
      </Row>
      <EditorPopover
        label={t('reminders.add')}
        anchor={anchor}
        onClose={close}
        onSubmit={() => {
          add.mutate(
            fixed
              ? { at: zonedInstant(at).toISOString() }
              : { beforeMinutes: Number(before), zone: localZone() },
            {
              onSuccess: () => {
                setAt('')
                shut()
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
            fullWidth
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
          <MomentField label={t('reminders.at')} value={at} onChange={setAt} />
        )}
        {add.isError && (
          <Typography role="alert" variant="caption" color="error">
            {t('reminders.failed')}
          </Typography>
        )}
        <EditorActions>
          <Button variant="text" onClick={close}>
            {t('board.cancel')}
          </Button>
          <Button type="submit" disabled={add.isPending || (fixed && !at)}>
            {t('reminders.save')}
          </Button>
        </EditorActions>
      </EditorPopover>
    </section>
  )
}
