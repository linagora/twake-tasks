import { Bell, CrossSmall, Plus } from '@linagora/twake-icons'
import {
  Button,
  Chip,
  IconButton,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import { ApiError, type NewReminder, type Reminder } from '@/application/boards'
import { Row } from '@/ds/Columns'
import { Icon } from '@/ds/Icon'
import { EditorActions, EditorPopover, MomentField } from '@/ds/Pickers'
import { Chips } from '@/ds/SidePanel'
import type { Task } from '@/domain/board'
import { localZone, momentFormat, zonedInstant } from '@/ui/boards/dueLabel'
import {
  useAddReminder,
  useDeleteReminder,
  useReminders
} from '@/ui/queries/reminders'
import { useI18n } from '@/ui/i18n/useI18n'

const BEFORE = ['0', '15', '60', '1440', 'at'] as const
type Before = (typeof BEFORE)[number]

const HOUR = 60
const DAY = 24 * HOUR

export function Reminders({
  task,
  boardId,
  archived
}: {
  task: Task
  boardId: string
  archived: boolean
}): ReactElement {
  const { t } = useI18n()
  const reminders = useReminders(boardId, task.id)
  const add = useAddReminder(boardId, task.id)
  const remove = useDeleteReminder(boardId, task.id)

  return (
    <ReminderControls
      reminders={reminders.data ?? []}
      due={task.dueDate !== null}
      addable={!archived}
      onDelete={reminder => {
        remove.mutate(reminder.id)
      }}
      onAdd={(reminder, added) => {
        add.mutate(reminder, { onSuccess: added })
      }}
      adding={add.isPending}
      error={
        add.isError
          ? add.error instanceof ApiError &&
            add.error.code === 'invalid_reminder'
            ? t('reminders.past')
            : add.error instanceof ApiError &&
                add.error.code === 'too_many_reminders'
              ? t('reminders.tooMany')
              : t('reminders.failed')
          : null
      }
      onEdit={() => {
        add.reset()
      }}
    />
  )
}

type ShownReminder = Pick<Reminder, 'id' | 'at' | 'beforeMinutes'>

/**
 * The reminders as chips, and a popover to add one: before the due time
 * when there is one, else at a set time.
 */
export function ReminderControls({
  reminders,
  due,
  addable,
  onDelete,
  onAdd,
  adding,
  error,
  onEdit
}: {
  reminders: ShownReminder[]
  due: boolean
  addable: boolean
  onDelete: (reminder: ShownReminder) => void
  /** Calls `added` once the reminder is kept. */
  onAdd: (reminder: NewReminder, added: () => void) => void
  adding: boolean
  error: string | null
  /** The reminder being added changed. */
  onEdit: () => void
}): ReactElement {
  const { t, lang } = useI18n()
  const [before, setBefore] = useState<Before>('0')
  const [at, setAt] = useState('')
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const shut = () => {
    setAnchor(null)
  }
  const format = momentFormat(lang)
  const fixed = !due || before === 'at'

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
    onEdit()
    shut()
  }

  return (
    <section aria-label={t('reminders.title')} className="u-w-100">
      <Row>
        {reminders.length > 0 ? (
          <Chips label={t('reminders.title')}>
            {reminders.map(reminder => {
              const label =
                reminder.beforeMinutes === null
                  ? format.format(new Date(reminder.at ?? ''))
                  : beforeLabel(reminder.beforeMinutes)
              return (
                <li key={reminder.id}>
                  <Chip
                    size="small"
                    icon={<Icon icon={Bell} size={12} />}
                    label={label}
                  />
                  <IconButton
                    size="small"
                    aria-label={t('reminders.delete', { reminder: label })}
                    onClick={() => {
                      onDelete(reminder)
                    }}
                  >
                    <Icon icon={CrossSmall} size={12} />
                  </IconButton>
                </li>
              )
            })}
          </Chips>
        ) : (
          <Typography variant="body2" color="textSecondary">
            {t('reminders.none')}
          </Typography>
        )}
        {addable && (
          <IconButton
            size="small"
            aria-label={t('reminders.add')}
            onClick={event => {
              setAnchor(event.currentTarget)
            }}
          >
            <Icon icon={Plus} size={14} />
          </IconButton>
        )}
      </Row>
      <EditorPopover
        label={t('reminders.add')}
        anchor={addable ? anchor : null}
        onClose={close}
        onSubmit={() => {
          onAdd(
            fixed
              ? { at: zonedInstant(at).toISOString() }
              : { beforeMinutes: Number(before), zone: localZone() },
            () => {
              setAt('')
              shut()
            }
          )
        }}
      >
        {due && (
          <TextField
            select
            label={t('reminders.remindMe')}
            value={before}
            onChange={event => {
              onEdit()
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
          <MomentField
            label={t('reminders.at')}
            value={at}
            onChange={value => {
              onEdit()
              setAt(value)
            }}
          />
        )}
        {error && (
          <Typography role="alert" variant="caption" color="error">
            {error}
          </Typography>
        )}
        <EditorActions>
          <Button variant="text" size="small" onClick={close}>
            {t('board.cancel')}
          </Button>
          <Button
            type="submit"
            size="small"
            disabled={adding || (fixed && !at)}
          >
            {t('reminders.save')}
          </Button>
        </EditorActions>
      </EditorPopover>
    </section>
  )
}
