import { Check } from '@linagora/twake-icons'
import { Box, MenuItem, TextField } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import { Icon } from '@/ds/Icon'

/** `shown` is what the field reads, picks or none. Picks keep the options' order. */
export function MultiSelect<T extends string>({
  label,
  options,
  value,
  shown,
  onChange
}: {
  label: string
  options: { value: T; name: string }[]
  value: T[]
  shown: string
  onChange: (value: T[]) => void
}): ReactElement {
  return (
    <TextField
      select
      label={label}
      value={value}
      onChange={event => {
        const picked: unknown = event.target.value
        if (!Array.isArray(picked)) return
        onChange(
          options.flatMap(option =>
            picked.includes(option.value) ? [option.value] : []
          )
        )
      }}
      slotProps={{
        // With no pick the field still reads `shown`, which MUI would otherwise
        // draw the label over.
        inputLabel: { shrink: true },
        select: {
          multiple: true,
          displayEmpty: true,
          renderValue: () => shown,
          MenuProps: { slotProps: { paper: { sx: { maxWidth: 360 } } } }
        }
      }}
    >
      {options.map(option => (
        <MenuItem key={option.value} value={option.value} sx={{ gap: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }} className="u-ellipsis">
            {option.name}
          </Box>
          <Box
            component="span"
            sx={{ display: 'flex', color: 'primary.main', width: 16 }}
          >
            {value.includes(option.value) && <Icon icon={Check} size={16} />}
          </Box>
        </MenuItem>
      ))}
    </TextField>
  )
}
