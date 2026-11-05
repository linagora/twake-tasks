import {
  Alert,
  Box,
  Checkbox,
  Chip,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useId, type ReactElement } from 'react'

import { DayField, FieldRow, QuickPicks, TimeField } from '@/ds/Pickers'
import type { ScheduleRule } from '@/domain/board'
import { unitName } from '@/ui/boards/DueFields'
import { useI18n } from '@/ui/i18n/useI18n'
import { monthName, weekdayName } from '@/ui/settings/scheduleSummary'
import {
  DAYS_IN,
  MAX_EVERY,
  type ScheduleFieldsProps
} from '@/ui/settings/useScheduleDraft'

const KINDS: ScheduleRule['kind'][] = ['daily', 'weekly', 'monthly', 'yearly']
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const DAYS = Array.from({ length: 31 }, (_, index) => index + 1)

export function ScheduleFields({
  draft,
  set,
  boards,
  pausedBy,
  missing
}: ScheduleFieldsProps): ReactElement {
  const { t, lang } = useI18n()
  const weekdaysId = useId()

  return (
    <Stack spacing={1.5}>
      <Box>
        <FormControlLabel
          label={t('templates.schedule.title')}
          control={
            <Switch
              checked={draft.on}
              onChange={event => {
                set({ on: event.target.checked })
              }}
            />
          }
        />
        <Typography variant="caption" color="textSecondary" component="p">
          {t('templates.schedule.hint')}
        </Typography>
      </Box>
      {draft.on && (
        <>
          {pausedBy && !draft.paused && (
            <Alert severity="warning">
              {t(
                pausedBy === 'author'
                  ? 'templates.schedule.pausedByAuthor'
                  : 'templates.schedule.pausedByBoard'
              )}
            </Alert>
          )}
          <TextField
            select
            label={t('templates.schedule.board')}
            value={draft.boardId}
            onChange={event => {
              set({ boardId: event.target.value })
            }}
            size="small"
            fullWidth
            error={missing === 'board'}
            helperText={
              missing === 'board' ? t('templates.schedule.noBoard') : undefined
            }
            slotProps={{ select: unitName(t('templates.schedule.board')) }}
          >
            {boards.map(each => (
              <MenuItem key={each.id} value={each.id}>
                {each.name}
              </MenuItem>
            ))}
          </TextField>
          <FieldRow>
            <TextField
              select
              label={t('templates.schedule.repeat')}
              value={draft.kind}
              onChange={event => {
                set({ kind: event.target.value as ScheduleRule['kind'] })
              }}
              size="small"
              slotProps={{ select: unitName(t('templates.schedule.repeat')) }}
            >
              {KINDS.map(kind => (
                <MenuItem key={kind} value={kind}>
                  {t(`templates.schedule.kinds.${kind}`)}
                </MenuItem>
              ))}
            </TextField>
            {draft.kind !== 'yearly' && (
              <TextField
                type="number"
                label={t('templates.schedule.every')}
                value={draft.every}
                onChange={event => {
                  set({ every: event.target.value })
                }}
                size="small"
                slotProps={{
                  htmlInput: { min: 1, max: MAX_EVERY[draft.kind] },
                  input: {
                    endAdornment: (
                      <Typography variant="body2" color="textSecondary">
                        {t(`templates.schedule.units.${draft.kind}`, {
                          smart_count: Number(draft.every) || 1
                        })}
                      </Typography>
                    )
                  }
                }}
              />
            )}
            <TimeField
              label={t('templates.schedule.time')}
              value={draft.time}
              onChange={time => {
                if (time) set({ time })
              }}
              disabled={false}
            />
          </FieldRow>
          {draft.kind === 'weekly' && (
            <Stack spacing={0.5} role="group" aria-labelledby={weekdaysId}>
              <Typography variant="body2" color="textSecondary" id={weekdaysId}>
                {t('templates.schedule.weekdays')}
              </Typography>
              <QuickPicks>
                {WEEKDAYS.map(weekday => {
                  const chosen = draft.weekdays.includes(weekday)
                  return (
                    <Chip
                      key={weekday}
                      label={weekdayName(weekday, lang, 'short')}
                      aria-label={weekdayName(weekday, lang)}
                      aria-pressed={chosen}
                      color={chosen ? 'primary' : 'default'}
                      variant={chosen ? 'filled' : 'outlined'}
                      onClick={() => {
                        set({
                          weekdays: chosen
                            ? draft.weekdays.filter(each => each !== weekday)
                            : [...draft.weekdays, weekday]
                        })
                      }}
                    />
                  )
                })}
              </QuickPicks>
              {missing === 'weekdays' && (
                <Typography role="alert" variant="caption" color="error">
                  {t('templates.schedule.weekdaysRequired')}
                </Typography>
              )}
            </Stack>
          )}
          {draft.kind === 'monthly' && (
            <TextField
              select
              label={t('templates.schedule.monthDay')}
              value={draft.monthDay}
              onChange={event => {
                set({ monthDay: event.target.value })
              }}
              size="small"
              fullWidth
              slotProps={{
                select: unitName(t('templates.schedule.monthDay'))
              }}
            >
              {DAYS.map(day => (
                <MenuItem key={day} value={String(day)}>
                  {day}
                </MenuItem>
              ))}
              <MenuItem value="last">
                {t('templates.schedule.lastDay')}
              </MenuItem>
            </TextField>
          )}
          {draft.kind === 'yearly' && (
            <FieldRow>
              <TextField
                select
                label={t('templates.schedule.month')}
                value={draft.month}
                onChange={event => {
                  set({ month: event.target.value })
                }}
                size="small"
                slotProps={{ select: unitName(t('templates.schedule.month')) }}
              >
                {MONTHS.map(month => (
                  <MenuItem key={month} value={String(month)}>
                    {monthName(month, lang)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label={t('templates.schedule.day')}
                value={draft.day}
                onChange={event => {
                  set({ day: event.target.value })
                }}
                size="small"
                slotProps={{ select: unitName(t('templates.schedule.day')) }}
              >
                {DAYS.slice(0, DAYS_IN[Number(draft.month) - 1]).map(day => (
                  <MenuItem key={day} value={String(day)}>
                    {day}
                  </MenuItem>
                ))}
              </TextField>
            </FieldRow>
          )}
          <FormControlLabel
            label={t('templates.schedule.workingDays')}
            control={
              <Checkbox
                size="small"
                checked={draft.workingDays}
                onChange={event => {
                  set({ workingDays: event.target.checked })
                }}
              />
            }
          />
          <Box>
            <DayField
              label={t('templates.schedule.endsOn')}
              value={draft.endsOn}
              onChange={endsOn => {
                set({ endsOn })
              }}
            />
            <Typography variant="caption" color="textSecondary">
              {t('templates.schedule.endsOnHint')}
            </Typography>
          </Box>
          <FormControlLabel
            label={t('templates.schedule.paused')}
            control={
              <Checkbox
                size="small"
                checked={draft.paused}
                onChange={event => {
                  set({ paused: event.target.checked })
                }}
              />
            }
          />
        </>
      )}
    </Stack>
  )
}
