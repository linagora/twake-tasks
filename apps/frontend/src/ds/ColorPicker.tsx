import { Check, Palette } from '@linagora/twake-icons'
import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  COLORS,
  Popover,
  TextField,
  Typography
} from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'
import { HexColorPicker } from 'react-colorful'

import { Icon } from '@/ds/Icon'

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

const SWATCH_NAMES = {
  '#273891': 'navy',
  '#7E57E3': 'violet',
  '#9E83E8': 'lavender',
  '#91CEF6': 'sky',
  '#2D83FF': 'blue',
  '#006BD8': 'ocean',
  '#038199': 'teal',
  '#51B588': 'green',
  '#457D6C': 'forest',
  '#1EBBCC': 'turquoise',
  '#E0465C': 'red',
  '#ED20A4': 'fuchsia',
  '#ED768D': 'pink',
  '#B85B17': 'rust',
  '#EDA91D': 'amber',
  '#BA8144': 'brown',
  '#ED916B': 'salmon',
  '#EDC661': 'yellow',
  '#131326': 'black',
  '#646580': 'grey'
} as const

type SwatchName = (typeof SWATCH_NAMES)[keyof typeof SWATCH_NAMES]

export function swatchName(color: string): SwatchName | undefined {
  return (SWATCH_NAMES as Partial<Record<string, SwatchName>>)[
    color.toUpperCase()
  ]
}

/**
 * A color beside a text field, as the admin panel picks a team's: a square
 * with the color in it, which opens twake-mui's swatches, then a picker of
 * any color from the palette at their end.
 */
export function ColorField({
  label,
  buttonLabel,
  customLabel,
  cancelLabel,
  saveLabel,
  colorName,
  value,
  onChange
}: {
  /** The name of the swatches' popover and radio group */
  label: string
  /** The name of the square, which says the color it holds */
  buttonLabel: string
  customLabel: string
  cancelLabel: string
  saveLabel: string
  colorName: (color: string) => string
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
        aria-label={buttonLabel}
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
          <Swatches
            label={label}
            customLabel={customLabel}
            colorName={colorName}
            value={value}
            onSelect={onChange}
            onPick={color => {
              onChange(color)
              close()
            }}
            onCustom={() => {
              setCustom(true)
            }}
          />
        )}
      </Popover>
    </>
  )
}

const COLUMNS = 7
const SWATCH = 21
const FOCUS_RING = {
  '&.Mui-focusVisible': {
    outline: '2px solid',
    outlineColor: 'primary.main',
    outlineOffset: 2
  }
}

const focusChecked = (group: HTMLElement | null) => {
  group?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus()
}

/**
 * twake-mui's ColorList, drawn the same, as a radio group: one tab stop, the
 * arrows move the choice, Enter or a click keeps it and closes.
 */
function Swatches({
  label,
  customLabel,
  colorName,
  value,
  onSelect,
  onPick,
  onCustom
}: {
  label: string
  customLabel: string
  colorName: (color: string) => string
  value: string | null
  onSelect: (color: string) => void
  onPick: (color: string) => void
  onCustom: () => void
}): ReactElement {
  const checked = value?.toUpperCase()
  const tabStop = Math.max(COLORS.indexOf(checked ?? ''), 0)
  const rows = Math.ceil((COLORS.length + 1) / COLUMNS)

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${String(COLUMNS)}, 1fr)`,
        gridAutoRows: SWATCH,
        gap: '5px',
        justifyItems: 'center',
        width: 200
      }}
    >
      <Box
        ref={focusChecked}
        role="radiogroup"
        aria-label={label}
        onKeyDown={event => {
          const radios = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              '[role="radio"]'
            )
          ]
          const at = radios.indexOf(event.target as HTMLElement)
          const moves: Partial<Record<string, number>> = {
            ArrowRight: at + 1,
            ArrowDown: at + 1,
            ArrowLeft: at - 1,
            ArrowUp: at - 1,
            Home: 0,
            End: radios.length - 1
          }
          const to = moves[event.key]
          if (at < 0 || to === undefined) return
          event.preventDefault()
          const next = (to + radios.length) % radios.length
          const color = COLORS[next]
          if (color === undefined) return
          radios[next]?.focus()
          onSelect(color)
        }}
        sx={{
          display: 'grid',
          gridColumn: '1 / -1',
          gridRow: `1 / span ${String(rows)}`,
          gridTemplateColumns: 'subgrid',
          gridTemplateRows: 'subgrid',
          justifyItems: 'center'
        }}
      >
        {COLORS.map((color, index) => (
          <ButtonBase
            key={color}
            component="div"
            role="radio"
            aria-checked={color === checked}
            aria-label={colorName(color)}
            tabIndex={index === tabStop ? 0 : -1}
            className="u-bdrs-circle"
            sx={FOCUS_RING}
            onClick={() => {
              onPick(color)
            }}
          >
            <Avatar color={color} size={SWATCH}>
              {color === checked ? <Icon icon={Check} size={10} /> : ' '}
            </Avatar>
          </ButtonBase>
        ))}
      </Box>
      <ButtonBase
        aria-label={customLabel}
        onClick={onCustom}
        sx={{
          gridRow: Math.floor(COLORS.length / COLUMNS) + 1,
          gridColumn: (COLORS.length % COLUMNS) + 1,
          width: SWATCH,
          height: SWATCH,
          borderRadius: '50%',
          border: '1px solid transparent',
          backgroundImage:
            'linear-gradient(#fff, #fff), conic-gradient(from 0deg, #FB2C36, #AD46FF, #2B7FFF, #FB2C36)',
          backgroundOrigin: 'border-box',
          backgroundClip: 'padding-box, border-box',
          ...FOCUS_RING
        }}
      >
        <Icon icon={Palette} size={10} color="#000" />
      </ButtonBase>
    </Box>
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
