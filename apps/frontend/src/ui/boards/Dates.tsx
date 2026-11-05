import { Pen } from '@linagora/twake-icons'
import {
  Button,
  Divider,
  IconButton,
  MenuItem,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { Fragment, useState, type ReactElement } from 'react'

import { Row } from '@/ds/Columns'
import { Icon } from '@/ds/Icon'
import { DayField, EditorActions, EditorPopover, FieldRow } from '@/ds/Pickers'
import { deadlineBeforeDue, type Duration, type Task } from '@/domain/board'
import {
  dueLabel,
  formatDay,
  localZone,
  recurrenceLabel
} from '@/ui/boards/dueLabel'
import {
  dueChanges,
  DueFields,
  RepeatFields,
  unitName,
  type DueDraft
} from '@/ui/boards/DueFields'
import { useBoardChange } from '@/ui/queries/boards'
import { useI18n } from '@/ui/i18n/useI18n'

interface Draft extends DueDraft {
  deadline: string
  amount: string
  unit: Duration['unit']
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

function Summary({ task }: { task: Task }): ReactElement {
  const { t, lang } = useI18n()
  const due = dueLabel(task, lang)
  const facts = [
    due && t('board.due', { date: due }),
    task.deadline &&
      t('dates.deadlineOn', { date: formatDay(task.deadline, lang) }),
    task.duration &&
      t(`dates.${task.duration.unit}`, { amount: task.duration.amount }),
    task.recurrence && recurrenceLabel(t, task.recurrence)
  ].filter(Boolean)

  if (facts.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary">
        {t('dates.none')}
      </Typography>
    )
  }
  // A line breaks between the facts before it breaks inside one.
  return (
    <Typography variant="body2">
      {facts.map((fact, index) => (
        <Fragment key={index}>
          {index > 0 && '\u{a0}· '}
          <span className="u-dib">{fact}</span>
        </Fragment>
      ))}
    </Typography>
  )
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

export function DatesEditor({
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
  const zone = task.dueZone ?? localZone()
  const save = useBoardChange(boardId, (api, next: Draft) =>
    api.editTask(boardId, task.id, {
      ...dueChanges(next, zone),
      deadline: next.deadline || null,
      duration:
        Number(next.amount) > 0
          ? { amount: Number(next.amount), unit: next.unit }
          : null
    })
  )
  const set = (changes: Partial<Draft>) => {
    setDraft(previous => ({ ...previous, ...changes }))
  }
  const deadlineTooEarly = deadlineBeforeDue(draft.dueDate, draft.deadline)

  return (
    <EditorPopover
      label={t('task.dates')}
      anchor={anchor}
      onClose={onClose}
      onSubmit={() => {
        save.mutate(draft, { onSuccess: onClose })
      }}
    >
      <DueFields draft={draft} set={set} zone={zone} />
      <Divider />
      <DayField
        label={t('dates.deadline')}
        value={draft.deadline}
        onChange={deadline => {
          set({ deadline })
        }}
        error={deadlineTooEarly ? t('dates.deadlineTooEarly') : undefined}
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
          slotProps={{ select: unitName(t('dates.durationUnit')) }}
        >
          <MenuItem value="minutes">{t('dates.unitMinutes')}</MenuItem>
          <MenuItem value="days">{t('dates.unitDays')}</MenuItem>
        </TextField>
      </FieldRow>
      <RepeatFields
        draft={draft}
        set={set}
        fromTemplate={task.template !== null}
      />
      {save.isError && (
        <Typography role="alert" variant="caption" color="error">
          {t('dates.saveFailed')}
        </Typography>
      )}
      <EditorActions>
        <Button variant="text" size="small" onClick={onClose}>
          {t('board.cancel')}
        </Button>
        <Button
          type="submit"
          size="small"
          disabled={save.isPending || deadlineTooEarly}
        >
          {t('dates.save')}
        </Button>
      </EditorActions>
    </EditorPopover>
  )
}
