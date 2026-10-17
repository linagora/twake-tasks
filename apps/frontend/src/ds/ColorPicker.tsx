import { Check, Icon, Palette } from '@linagora/twake-icons'
import {
  Avatar,
  Box,
  Radio,
  RadioGroup,
  getInitials,
  radioClasses
} from '@linagora/twake-mui'
import type { ReactElement } from 'react'

/**
 * What a thing will look like in its color, its initials on it, or a palette
 * while it has none: Twake Space's preview of a new space.
 */
export function ColorPreview({
  name,
  color,
  size
}: {
  name: string
  color: string | null
  size: number
}): ReactElement {
  return color ? (
    <Avatar size={size} color={color}>
      {getInitials(name, '')}
    </Avatar>
  ) : (
    <Avatar size={size} color="var(--twake-palette-background-default)">
      <Icon icon={Palette} size={size / 3} color="#424244" />
    </Avatar>
  )
}

function Swatch({
  color,
  checked
}: {
  color: string | null
  checked: boolean
}): ReactElement {
  return (
    <Box
      component="span"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 25,
        height: 25,
        borderRadius: '50%',
        boxSizing: 'border-box',
        bgcolor: color ?? 'background.paper',
        border: color ? 0 : 1,
        borderColor: 'divider',
        color: color ? '#fff' : 'text.primary'
      }}
    >
      {checked && <Icon icon={Check} size={12} />}
    </Box>
  )
}

/** Twake Space's round swatches, each one named, filling the line. */
export function ColorGrid({
  labelledBy,
  swatches,
  none,
  value,
  onChange
}: {
  /** The id of the text naming the grid */
  labelledBy: string
  swatches: readonly { value: string; label: string }[]
  /** The name of the swatch with no color, when the color may be none. */
  none?: string | undefined
  value: string | null
  onChange: (color: string | null) => void
}): ReactElement {
  const options = [
    ...(none === undefined ? [] : [{ value: '', label: none }]),
    ...swatches
  ]
  return (
    <RadioGroup
      aria-labelledby={labelledBy}
      value={value ?? ''}
      onChange={(_event, color) => {
        onChange(color || null)
      }}
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, 25px)',
        gap: '12px 10px'
      }}
    >
      {options.map(option => (
        <Radio
          key={option.value || 'none'}
          value={option.value}
          icon={<Swatch color={option.value || null} checked={false} />}
          checkedIcon={<Swatch color={option.value || null} checked />}
          slotProps={{ input: { 'aria-label': option.label } }}
          sx={{
            p: 0,
            '& svg': { fill: 'currentColor' },
            [`&.${radioClasses.checked} svg`]: { fill: 'currentColor' }
          }}
        />
      ))}
    </RadioGroup>
  )
}
