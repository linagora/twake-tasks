import { Icon, Palette } from '@linagora/twake-icons'
import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  COLORS,
  ColorList,
  Popover,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'
import { HexColorPicker } from 'react-colorful'

// The blue of folders, which twake-mui's swatches hold.
const FALLBACK_COLOR = '#2D83FF'
// The API takes six digits only, not the shorthand.
const FULL_HEX = /^#[0-9A-F]{6}$/i

/**
 * The first of twake-mui's swatches that `used` holds the least, so things
 * made one after another each get their own color.
 */
export function leastUsedColor(used: readonly (string | null)[]): string {
  const count = (value: string) =>
    used.filter(color => color?.toUpperCase() === value.toUpperCase()).length
  let best = COLORS[0] ?? FALLBACK_COLOR
  for (const color of COLORS) {
    if (count(color) < count(best)) best = color
  }
  return best
}

/**
 * A color beside a text field, as the admin panel picks a team's: a square
 * with the color in it, which opens twake-mui's swatches, then a picker of
 * any color from the palette at their end.
 */
export function ColorField({
  label,
  customLabel,
  cancelLabel,
  saveLabel,
  value,
  onChange
}: {
  label: string
  customLabel: string
  cancelLabel: string
  saveLabel: string
  value: string | null
  onChange: (color: string) => void
}): ReactElement {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [custom, setCustom] = useState(false)
  const close = () => {
    setAnchor(null)
    setCustom(false)
  }

  return (
    <>
      <ButtonBase
        aria-label={label}
        aria-haspopup="dialog"
        onClick={event => {
          setAnchor(event.currentTarget)
        }}
        sx={{
          flex: 'none',
          width: 56,
          height: 56,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          '&:hover': { borderColor: 'text.primary' }
        }}
      >
        {value ? (
          <Avatar color={value} size={24}>
            {' '}
          </Avatar>
        ) : (
          <Icon icon={Palette} size={20} />
        )}
      </ButtonBase>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-label': custom ? customLabel : label,
            sx: { p: 2, width: custom ? 246 : 'auto' }
          }
        }}
      >
        {custom ? (
          <CustomColor
            color={value ?? FALLBACK_COLOR}
            cancelLabel={cancelLabel}
            saveLabel={saveLabel}
            onCancel={() => {
              setCustom(false)
            }}
            onSave={color => {
              onChange(color)
              close()
            }}
          />
        ) : (
          <ColorList
            size="small"
            {...(value && { selectedColor: value.toUpperCase() })}
            onClick={color => {
              onChange(color)
              close()
            }}
            customColorProps={{
              enabled: true,
              onClick: () => {
                setCustom(true)
              }
            }}
            sx={{ width: 200 }}
          />
        )}
      </Popover>
    </>
  )
}

/** cozy-ui's custom color, which twake-mui has not yet. */
function CustomColor({
  color,
  cancelLabel,
  saveLabel,
  onCancel,
  onSave
}: {
  color: string
  cancelLabel: string
  saveLabel: string
  onCancel: () => void
  onSave: (color: string) => void
}): ReactElement {
  const [picked, setPicked] = useState(color.toUpperCase())
  const [hex, setHex] = useState(picked)
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        '& .react-colorful': { width: '100%' }
      }}
    >
      <HexColorPicker
        color={picked}
        onChange={next => {
          setPicked(next.toUpperCase())
          setHex(next.toUpperCase())
        }}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle2" component="span">
          Hex
        </Typography>
        <TextField
          variant="standard"
          size="small"
          value={hex}
          slotProps={{
            htmlInput: {
              'aria-label': 'Hex',
              spellCheck: false,
              // Upper-casing the value itself would move the caret to the end.
              style: { textTransform: 'uppercase' }
            }
          }}
          onChange={event => {
            const next = `#${event.target.value
              .replace(/[^0-9A-F]/gi, '')
              .slice(0, 6)}`
            setHex(next)
            if (FULL_HEX.test(next)) setPicked(next.toUpperCase())
          }}
        />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button variant="text" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant="secondary"
          disabled={!FULL_HEX.test(hex)}
          onClick={() => {
            onSave(hex.toUpperCase())
          }}
        >
          {saveLabel}
        </Button>
      </Box>
    </Box>
  )
}
