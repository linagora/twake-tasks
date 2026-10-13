import '@/ds/dayjsLocales'

import { Box, Popover } from '@linagora/twake-mui'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import {
  deDE,
  enUS,
  esES,
  frFR,
  itIT,
  ruRU,
  viVN
} from '@mui/x-date-pickers/locales'
import dayjs, { type Dayjs } from 'dayjs'
import type { ComponentProps, ReactElement, ReactNode } from 'react'

type LocaleText = NonNullable<
  ComponentProps<typeof LocalizationProvider>['localeText']
>

const TEXTS: Record<string, typeof enUS> = {
  en: enUS,
  fr: frFR,
  de: deDE,
  it: itIT,
  es: esES,
  ru: ruRU,
  vi: viVN
}

const DAY = 'YYYY-MM-DD'
const MINUTE = 'YYYY-MM-DDTHH:mm'

export function PickersProvider({
  lang,
  children
}: {
  lang: string
  children: ReactNode
}): ReactElement {
  return (
    <LocalizationProvider
      dateAdapter={AdapterDayjs}
      adapterLocale={lang}
      // The locale packs type each text as `string | undefined`, which
      // exactOptionalPropertyTypes refuses for an optional key.
      localeText={
        (TEXTS[lang] ?? enUS).components.MuiLocalizationProvider.defaultProps
          .localeText as LocaleText
      }
    >
      {children}
    </LocalizationProvider>
  )
}

const parse = (value: string): Dayjs | null => (value ? dayjs(value) : null)

/** Days are YYYY-MM-DD strings, empty for none. */
export function DayCalendar({
  value,
  onChange
}: {
  value: string
  onChange: (day: string) => void
}): ReactElement {
  return (
    <DateCalendar
      value={parse(value)}
      onChange={(next: Dayjs | null) => {
        onChange(next?.format(DAY) ?? '')
      }}
      sx={{
        width: '100%',
        height: 'auto',
        '& .MuiPickersCalendarHeader-root': { mt: 0, mb: 0.5, pl: 1.5 },
        '& .MuiDayCalendar-weekDayLabel': { width: 32, height: 32 },
        '& .MuiPickerDay-root': { '--PickerDay-size': '32px' },
        // Six weeks of 32px days and their 2px margins
        '& .MuiDayCalendar-slideTransition': { minHeight: 6 * 36 }
      }}
    />
  )
}

export function DayField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (day: string) => void
}): ReactElement {
  return (
    <DatePicker
      label={label}
      value={parse(value)}
      onChange={(next: Dayjs | null) => {
        onChange(next?.isValid() ? next.format(DAY) : '')
      }}
      slotProps={{
        textField: { size: 'small', fullWidth: true },
        field: { clearable: true }
      }}
    />
  )
}

/** Moments are local YYYY-MM-DDTHH:mm strings, empty for none. */
export function MomentField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (moment: string) => void
}): ReactElement {
  return (
    <DateTimePicker
      label={label}
      value={parse(value)}
      ampm={false}
      onChange={(next: Dayjs | null) => {
        onChange(next?.isValid() ? next.format(MINUTE) : '')
      }}
      slotProps={{ textField: { size: 'small', fullWidth: true } }}
    />
  )
}

export function EditorPopover({
  label,
  anchor,
  onClose,
  onSubmit,
  children
}: {
  label: string
  anchor: HTMLElement | null
  onClose: () => void
  onSubmit: () => void
  children: ReactNode
}): ReactElement {
  return (
    <Popover
      open={anchor !== null}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-label': label,
          sx: { width: 320, maxWidth: 'calc(100vw - 32px)' }
        }
      }}
    >
      <Box
        component="form"
        onSubmit={event => {
          event.preventDefault()
          onSubmit()
        }}
        sx={{
          p: 1.5,
          display: 'grid',
          gap: 1,
          // twake-mui makes small fields 48px high, MUI's own 40px fit here
          '& .MuiInputBase-sizeSmall:not(.MuiInputBase-multiline) .MuiInputBase-input':
            { py: '8.5px' },
          '& .MuiInputLabel-sizeSmall:not(.MuiInputLabel-shrink)': {
            transform: 'translate(14px, 9px) scale(1)'
          },
          '& .MuiFormControlLabel-label': { typography: 'body2' }
        }}
      >
        {children}
      </Box>
    </Popover>
  )
}

export function EditorActions({
  children
}: {
  children: ReactNode
}): ReactElement {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
      {children}
    </Box>
  )
}

export function QuickPicks({
  children
}: {
  children: ReactNode
}): ReactElement {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{children}</Box>
  )
}

export function FieldRow({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        '& > *': { flex: '1 1 0', minWidth: 0 }
      }}
    >
      {children}
    </Box>
  )
}
