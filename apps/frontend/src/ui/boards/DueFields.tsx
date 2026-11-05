import {
  Box,
  Checkbox,
  Chip,
  FormControlLabel,
  MenuItem,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useId, type ReactElement } from 'react'

import type { TaskChanges } from '@/application/boards'
import { DayCalendar, FieldRow, QuickPicks, TimeField } from '@/ds/Pickers'
import type { Recurrence } from '@/domain/board'
import { inDays, untilNextMonday } from '@/ui/boards/dueLabel'
import { useI18n } from '@/ui/i18n/useI18n'

/** As typed: empty strings for none. */
export interface DueDraft {
  dueDate: string
  dueTime: string
  pinned: boolean
  every: string
  recurUnit: Recurrence['unit']
  fromCompletion: boolean
}

export const NO_DUE: DueDraft = {
  dueDate: '',
  dueTime: '',
  pinned: false,
  every: '',
  recurUnit: 'weeks',
  fromCompletion: false
}

/** Without a day, no time and no repeat. `zone` is where a pinned time is. */
export function dueChanges(
  draft: DueDraft,
  zone: string
): Required<
  Pick<TaskChanges, 'dueDate' | 'dueTime' | 'dueZone' | 'recurrence'>
> {
  const dueTime = draft.dueDate && draft.dueTime ? draft.dueTime : null
  return {
    dueDate: draft.dueDate || null,
    dueTime,
    dueZone: dueTime && draft.pinned ? zone : null,
    recurrence:
      draft.dueDate && Number(draft.every) > 0
        ? {
            every: Number(draft.every),
            unit: draft.recurUnit,
            fromCompletion: draft.fromCompletion
          }
        : null
  }
}

const RECURRENCE_UNITS: Recurrence['unit'][] = [
  'days',
  'weeks',
  'months',
  'years'
]

// Both unit fields show "Unit"; MUI names the select and its listbox after
// that label unless aria-labelledby is cleared.
export const unitName = (name: string) => {
  const named = { 'aria-labelledby': undefined, 'aria-label': name }
  return {
    SelectDisplayProps: named,
    MenuProps: { slotProps: { list: named } }
  }
}

export function DueFields({
  draft,
  set,
  zone
}: {
  draft: DueDraft
  set: (changes: Partial<DueDraft>) => void
  zone: string
}): ReactElement {
  const { t } = useI18n()
  const dueId = useId()
  const picks = [
    { label: t('dates.today'), day: inDays(0) },
    { label: t('dates.tomorrow'), day: inDays(1) },
    { label: t('dates.nextWeek'), day: inDays(untilNextMonday()) },
    { label: t('dates.noDate'), day: '' }
  ]

  return (
    <>
      <Typography variant="subtitle2" component="h3" id={dueId}>
        {t('dates.dueDate')}
      </Typography>
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
      <Box role="group" aria-labelledby={dueId}>
        <DayCalendar
          value={draft.dueDate}
          onChange={dueDate => {
            set({ dueDate })
          }}
        />
      </Box>
      <TimeField
        label={t('dates.time')}
        value={draft.dueTime}
        disabled={!draft.dueDate}
        onChange={dueTime => {
          set({ dueTime })
        }}
      />
      {draft.dueDate && draft.dueTime && (
        <FormControlLabel
          label={t('dates.pin', { zone })}
          control={
            <Checkbox
              size="small"
              checked={draft.pinned}
              onChange={event => {
                set({ pinned: event.target.checked })
              }}
            />
          }
        />
      )}
    </>
  )
}

/** A task made from a template cannot repeat. */
export function RepeatFields({
  draft,
  set,
  fromTemplate
}: {
  draft: DueDraft
  set: (changes: Partial<DueDraft>) => void
  fromTemplate: boolean
}): ReactElement {
  const { t } = useI18n()
  const repeatable = draft.dueDate !== '' && !fromTemplate

  return (
    <>
      <FieldRow>
        <TextField
          type="number"
          label={t('dates.repeatEvery')}
          value={draft.every}
          disabled={!repeatable}
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
          disabled={!repeatable}
          onChange={event => {
            set({ recurUnit: event.target.value as Recurrence['unit'] })
          }}
          size="small"
          slotProps={{ select: unitName(t('dates.repeatUnit')) }}
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
        disabled={!repeatable}
        control={
          <Checkbox
            size="small"
            checked={draft.fromCompletion}
            onChange={event => {
              set({ fromCompletion: event.target.checked })
            }}
          />
        }
      />
      {fromTemplate && (
        <Typography variant="caption" color="textSecondary">
          {t('dates.templateNoRepeat')}
        </Typography>
      )}
    </>
  )
}
