import { Box, Tooltip } from '@linagora/twake-mui'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref
} from 'react'

export interface FittingChip {
  key: string
  name: string
  chip: ReactNode
}

const GAP = 4

/**
 * Chips on a single line: those that do not fit give way to a “+n” chip
 * naming them, so that every row of a list keeps the same height.
 */
export function FittingChips({
  chips,
  moreLabel
}: {
  chips: FittingChip[]
  moreLabel: (count: number, names: string) => string
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  // A renamed chip keeps its key but not its width.
  const keys = chips.map(each => `${each.key}\t${each.name}`).join('\n')
  const [measured, setMeasured] = useState<{
    keys: string
    widths: number[]
  } | null>(null)
  const [width, setWidth] = useState(0)
  const ready = measured?.keys === keys

  // Every chip and a “+n” chip are laid out once, unseen, to learn their
  // widths.
  useLayoutEffect(() => {
    const row = ref.current
    if (ready || !row) return
    setMeasured({
      keys,
      // Unrounded, so that the widths add up to no more than the row.
      widths: [...row.children].map(
        child => child.getBoundingClientRect().width
      )
    })
  }, [ready, keys])

  // Chips measured in a fallback font are too narrow or too wide once the
  // web font arrives.
  useEffect(() => {
    if (!('fonts' in document) || document.fonts.status === 'loaded') return
    void document.fonts.ready.then(() => {
      setMeasured(null)
    })
  }, [])

  useLayoutEffect(() => {
    const row = ref.current
    if (!row) return
    setWidth(row.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      setWidth(row.clientWidth)
    })
    observer.observe(row)
    return () => {
      observer.disconnect()
    }
  }, [])

  const shown = ready ? countFitting(width, measured.widths) : chips.length
  const hidden = chips.slice(shown)
  const hiddenNames = hidden.map(each => each.name).join(', ')
  const clipped =
    ready &&
    width > 0 &&
    (measured.widths[0] ?? 0) +
      (hidden.length > 0 ? GAP + (measured.widths.at(-1) ?? 0) : 0) >
      width
  return (
    <Box
      ref={ref}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: `${String(GAP)}px`,
        minWidth: 0,
        overflow: 'hidden',
        '& > *': { flexShrink: 0 },
        // Measured at their full width, the first chip then shrinks alone.
        ...(ready && { '& > :first-of-type': { flexShrink: 1, minWidth: 0 } })
      }}
    >
      {chips.slice(0, shown).map((each, index) => (
        <Tooltip key={each.key} title={index === 0 && clipped ? each.name : ''}>
          <Box component="span" sx={{ display: 'flex' }}>
            {each.chip}
          </Box>
        </Tooltip>
      ))}
      {!ready && <MoreChip label="" count={chips.length} unseen />}
      {ready && hidden.length > 0 && (
        <Tooltip title={hiddenNames}>
          <MoreChip
            label={moreLabel(hidden.length, hiddenNames)}
            count={hidden.length}
          />
        </Tooltip>
      )}
    </Box>
  )
}

/**
 * How many chips of these widths fit in the row, the last width being the
 * one of the “+n” chip. A row too narrow for any keeps its first chip,
 * which shrinks; a row not laid out yet keeps them all.
 */
export function countFitting(width: number, widths: number[]): number {
  const chips = widths.slice(0, -1)
  const more = widths.at(-1) ?? 0
  if (width === 0) return chips.length
  let used = 0
  let count = 0
  for (const [index, chip] of chips.entries()) {
    const after = index + 1 < chips.length ? GAP + more : 0
    const next = used + (index > 0 ? GAP : 0) + chip
    if (next + after > width) break
    used = next
    count = index + 1
  }
  return Math.max(count, Math.min(1, chips.length))
}

// The tooltip hands its ref and its listeners to the chip.
function MoreChip({
  label,
  count,
  unseen = false,
  ref,
  ...rest
}: {
  label: string
  count: number
  unseen?: boolean
  ref?: Ref<HTMLElement>
}): ReactElement {
  return (
    <Box
      {...rest}
      ref={ref}
      component="span"
      role={unseen ? undefined : 'img'}
      aria-label={label || undefined}
      aria-hidden={unseen || undefined}
      sx={{
        visibility: unseen ? 'hidden' : 'visible',
        position: 'relative',
        zIndex: 1,
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        px: 1,
        borderRadius: 10,
        typography: 'caption',
        fontWeight: 500,
        lineHeight: 1,
        color: 'text.secondary',
        bgcolor: 'action.selected'
      }}
    >
      {`+${String(count)}`}
    </Box>
  )
}
