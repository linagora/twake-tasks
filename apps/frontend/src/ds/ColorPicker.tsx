import { Check, Icon, Palette, Pen } from '@linagora/twake-icons'
import {
  Avatar,
  Box,
  IconButton,
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

/** The preview with a pen on it, which opens the choice of color. */
export function ColorPreviewButton({
  name,
  color,
  label,
  onClick
}: {
  name: string
  color: string | null
  label: string
  onClick: () => void
}): ReactElement {
  return (
    <Box sx={{ position: 'relative', flex: 'none' }}>
      <IconButton aria-label={label} onClick={onClick} sx={{ p: 0 }}>
        <ColorPreview name={name} color={color} size={72} />
        <Box
          component="span"
          sx={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: 30,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            border: 3,
            borderColor: 'background.paper',
            bgcolor: 'primary.main',
            color: 'primary.contrastText'
          }}
        >
          <Icon icon={Pen} size={12} />
        </Box>
      </IconButton>
    </Box>
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

/** Twake Space's grid of colors: round swatches, each one named. */
export function ColorGrid({
  label,
  swatches,
  none,
  value,
  onChange
}: {
  label: string
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
      aria-label={label}
      value={value ?? ''}
      onChange={(_event, color) => {
        onChange(color || null)
      }}
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 25px)',
        gap: '15px 8px',
        justifyContent: 'center'
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
