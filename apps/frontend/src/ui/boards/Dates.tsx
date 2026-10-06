import { Icon, Pen } from '@linagora/twake-icons'
import {
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import { Row } from '@/ds/Columns'
import {
  DayCalendar,
  DayField,
  EditorActions,
  EditorPopover,
  FieldRow,
  QuickPicks
} from '@/ds/Pickers'
import type { Duration, Recurrence, Task } from '@/domain/board'
import {
  dueLabel,
  formatDay,
  localToday,
  localZone
} from '@/ui/boards/dueLabel'
import { useBoardChange } from '@/ui/boards/queries'
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

const today = () => new Date(`${localToday()}T00:00:00Z`)

function inDays(days: number): string {
  const day = today()
  day.setUTCDate(day.getUTCDate() + days)
  return day.toISOString().slice(0, 10)
}

const untilNextMonday = (): number => 8 - (today().getUTCDay() || 7)

function Summary({ task }: { task: Task }): ReactElement {
  const { t, lang } = useI18n()
  const due = dueLabel(task, lang)
  const facts = [
    due && t('board.due', { date: due }),
    task.deadline &&
      t('dates.deadlineOn', { date: formatDay(task.deadline, lang) }),
    task.duration &&
      t(`dates.${task.duration.unit}`, { amount: task.duration.amount }),
    task.recurrence &&
      t(
        task.recurrence.fromCompletion
          ? `dates.every.${task.recurrence.unit}AfterCompletion`
          : `dates.every.${task.recurrence.unit}`,
        { smart_count: task.recurrence.every }
      )
  ].filter(Boolean)

  if (facts.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary">
        {t('dates.none')}
      </Typography>
    )
  }
  return <Typography variant="body2">{facts.join(' · ')}</Typography>
}

export function Dates({
  task,
  boardId,
  editable
}: {
  task: Task
  boardId: string
  editable: boolean
}): ReactElement {
  const { t } = useI18n()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  return (
    <Row>
      <Summary task={task} />
      {editable && (
        <IconButton
          size="small"
          aria-label={t('dates.edit')}
          onClick={event => {
            setAnchor(event.currentTarget)
          }}
        >
          <Icon icon={Pen} size={14} />
        </IconButton>
      )}
      {anchor && (
        <DatesEditor
          task={task}
          boardId={boardId}
          anchor={anchor}
          onClose={() => {
            setAnchor(null)
          }}
        />
      )}
    </Row>
  )
}

function DatesEditor({
  task,
  boardId,
  anchor,
  onClose
}: {
  task: Task
  boardId: string
  anchor: HTMLElement
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const [draft, setDraft] = useState(() => draftOf(task))
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
    setDraft(previous => ({ ...previous, ...changes }))
  }
  const picks = [
    { label: t('dates.today'), day: inDays(0) },
    { label: t('dates.tomorrow'), day: inDays(1) },
    { label: t('dates.nextWeek'), day: inDays(untilNextMonday()) },
    { label: t('dates.noDate'), day: '' }
  ]

  return (
    <EditorPopover
      label={t('task.dates')}
      anchor={anchor}
      onClose={onClose}
      onSubmit={() => {
        save.mutate(draft, { onSuccess: onClose })
      }}
    >
      <Typography variant="subtitle2">{t('dates.dueDate')}</Typography>
      <QuickPicks>
        {picks.map(pick => (
          <Chip
            key={pick.label}
            size="small"
            label={pick.label}
            variant={draft.dueDate === pick.day ? 'filled' : 'outlined'}
            onClick={() => {
              set({ dueDate: pick.day })
            }}
          />
        ))}
      </QuickPicks>
      <DayCalendar
        value={draft.dueDate}
        onChange={dueDate => {
          set({ dueDate })
        }}
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
        fullWidth
        slotProps={{ inputLabel: { shrink: true } }}
      />
      {draft.dueDate && draft.dueTime && (
        <FormControlLabel
          label={t('dates.pin', { zone: task.dueZone ?? localZone() })}
          control={
            <Checkbox
              checked={draft.pinned}
              onChange={event => {
                set({ pinned: event.target.checked })
              }}
            />
          }
        />
      )}
      <Divider />
      <DayField
        label={t('dates.deadline')}
        value={draft.deadline}
        onChange={deadline => {
          set({ deadline })
        }}
      />
      <FieldRow>
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
      </FieldRow>
      <FieldRow>
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
      </FieldRow>
      <FormControlLabel
        label={t('dates.fromCompletion')}
        disabled={!draft.dueDate}
        control={
          <Checkbox
            checked={draft.fromCompletion}
            onChange={event => {
              set({ fromCompletion: event.target.checked })
            }}
          />
        }
      />
      {save.isError && (
        <Typography role="alert" variant="caption" color="error">
          {t('dates.saveFailed')}
        </Typography>
      )}
      <EditorActions>
        <Button variant="text" onClick={onClose}>
          {t('board.cancel')}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {t('dates.save')}
        </Button>
      </EditorActions>
    </EditorPopover>
  )
}
