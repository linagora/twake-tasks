import {
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import type { Duration, Recurrence, Task } from '@/domain/board'
import { dueLabel, formatDay, localZone } from '@/ui/boards/dueLabel'
import { useBoardChange } from '@/ui/boards/queries'
import { Row } from '@/ds/Columns'
import { useI18n } from '@/ui/i18n/useI18n'

interface Draft {
  dueDate: string
  dueTime: string
  pinned: boolean
  deadline: string
  amount: string
  unit: Duration['unit']
  every: string
  recurUnit: Recurrence['unit']
  fromCompletion: boolean
}

function draftOf(task: Task): Draft {
  return {
    dueDate: task.dueDate ?? '',
    dueTime: task.dueTime ?? '',
    pinned: task.dueZone !== null,
    deadline: task.deadline ?? '',
    amount: task.duration ? String(task.duration.amount) : '',
    unit: task.duration?.unit ?? 'minutes',
    every: task.recurrence ? String(task.recurrence.every) : '',
    recurUnit: task.recurrence?.unit ?? 'weeks',
    fromCompletion: task.recurrence?.fromCompletion ?? false
  }
}

const RECURRENCE_UNITS: Recurrence['unit'][] = [
  'days',
  'weeks',
  'months',
  'years'
]

export function Dates({
  task,
  boardId,
  editable
}: {
  task: Task
  boardId: string
  editable: boolean
}): ReactElement {
  const { t, lang } = useI18n()
  const [draft, setDraft] = useState<Draft | null>(null)
  const save = useBoardChange(boardId, (api, next: Draft) => {
    const dueTime = next.dueDate && next.dueTime ? next.dueTime : null
    return api.editTask(boardId, task.id, {
      dueDate: next.dueDate || null,
      dueTime,
      dueZone: dueTime && next.pinned ? (task.dueZone ?? localZone()) : null,
      deadline: next.deadline || null,
      duration:
        Number(next.amount) > 0
          ? { amount: Number(next.amount), unit: next.unit }
          : null,
      recurrence:
        next.dueDate && Number(next.every) > 0
          ? {
              every: Number(next.every),
              unit: next.recurUnit,
              fromCompletion: next.fromCompletion
            }
          : null
    })
  })
  const set = (changes: Partial<Draft>) => {
    setDraft(previous => previous && { ...previous, ...changes })
  }
  const due = dueLabel(task, lang)

  if (draft === null) {
    return (
      <Row>
        {due && <Typography>{t('board.due', { date: due })}</Typography>}
        {task.deadline && (
          <Typography>
            {t('dates.deadlineOn', { date: formatDay(task.deadline, lang) })}
          </Typography>
        )}
        {task.duration && (
          <Typography>
            {t(`dates.${task.duration.unit}`, {
              amount: task.duration.amount
            })}
          </Typography>
        )}
        {task.recurrence && (
          <Typography>
            {t(
              task.recurrence.fromCompletion
                ? `dates.every.${task.recurrence.unit}AfterCompletion`
                : `dates.every.${task.recurrence.unit}`,
              { smart_count: task.recurrence.every }
            )}
          </Typography>
        )}
        {editable && (
          <Button
            variant="text"
            onClick={() => {
              setDraft(draftOf(task))
            }}
          >
            {t('dates.edit')}
          </Button>
        )}
      </Row>
    )
  }

  return (
    <form
      onSubmit={event => {
        event.preventDefault()
        save.mutate(draft, {
          onSuccess: () => {
            setDraft(null)
          }
        })
      }}
    >
      <Row>
        <TextField
          type="date"
          label={t('dates.dueDate')}
          value={draft.dueDate}
          onChange={event => {
            set({ dueDate: event.target.value })
          }}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          type="time"
          label={t('dates.time')}
          value={draft.dueTime}
          disabled={!draft.dueDate}
          onChange={event => {
            set({ dueTime: event.target.value })
          }}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Row>
      <FormControlLabel
        label={t('dates.pin', { zone: task.dueZone ?? localZone() })}
        control={
          <Checkbox
            checked={draft.pinned}
            disabled={!draft.dueTime}
            onChange={event => {
              set({ pinned: event.target.checked })
            }}
          />
        }
      />
      <Row>
        <TextField
          type="date"
          label={t('dates.deadline')}
          value={draft.deadline}
          onChange={event => {
            set({ deadline: event.target.value })
          }}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          type="number"
          label={t('dates.duration')}
          value={draft.amount}
          onChange={event => {
            set({ amount: event.target.value })
          }}
          size="small"
          slotProps={{ htmlInput: { min: 1 } }}
        />
        <TextField
          select
          label={t('dates.unit')}
          value={draft.unit}
          onChange={event => {
            set({ unit: event.target.value as Duration['unit'] })
          }}
          size="small"
        >
          <MenuItem value="minutes">{t('dates.unitMinutes')}</MenuItem>
          <MenuItem value="days">{t('dates.unitDays')}</MenuItem>
        </TextField>
      </Row>
      <Row>
        <TextField
          type="number"
          label={t('dates.repeatEvery')}
          value={draft.every}
          disabled={!draft.dueDate}
          onChange={event => {
            set({ every: event.target.value })
          }}
          size="small"
          slotProps={{ htmlInput: { min: 1, max: 1000 } }}
        />
        <TextField
          select
          label={t('dates.unit')}
          value={draft.recurUnit}
          disabled={!draft.dueDate}
          onChange={event => {
            set({ recurUnit: event.target.value as Recurrence['unit'] })
          }}
          size="small"
        >
          {RECURRENCE_UNITS.map(unit => (
            <MenuItem key={unit} value={unit}>
              {t(`dates.units.${unit}`)}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          label={t('dates.fromCompletion')}
          control={
            <Checkbox
              checked={draft.fromCompletion}
              disabled={!draft.dueDate}
              onChange={event => {
                set({ fromCompletion: event.target.checked })
              }}
            />
          }
        />
      </Row>
      {save.isError && (
        <Typography role="alert" variant="caption">
          {t('dates.saveFailed')}
        </Typography>
      )}
      <Row>
        <Button
          variant="text"
          onClick={() => {
            save.reset()
            setDraft(null)
          }}
        >
          {t('board.cancel')}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {t('dates.save')}
        </Button>
      </Row>
    </form>
  )
}
