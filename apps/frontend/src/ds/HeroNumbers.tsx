import { Box, Typography } from '@linagora/twake-mui'
import {
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type ReactElement,
  type ReactNode
} from 'react'

import { motion, MOTION_MS, useReducedMotion } from '@/ds/motion'

/**
 * A number that counts up or down to its new value. It draws in the DOM, not
 * by rendering every frame.
 */
export function CountUp({
  value,
  format = String
}: {
  value: number
  format?: (value: number) => string
}): ReactElement {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const drawn = useRef(value)
  const formatted = useEffectEvent((at: number) => format(Math.round(at)))
  // Before the paint, so that the new value never flashes first.
  useLayoutEffect(() => {
    const text = ref.current?.firstChild
    const from = drawn.current
    if (!text || reduced || from === value) {
      drawn.current = value
      return
    }
    let frame = 0
    let start: number | null = null
    const draw = (now: number) => {
      start ??= now
      const progress = Math.min(1, (now - start) / MOTION_MS)
      drawn.current =
        progress === 1
          ? value
          : from + (value - from) * (1 - (1 - progress) ** 3)
      text.nodeValue = formatted(drawn.current)
      if (progress < 1) frame = requestAnimationFrame(draw)
    }
    text.nodeValue = formatted(from)
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [value, reduced])
  return <span ref={ref}>{format(value)}</span>
}

export function HeroStats({
  label,
  children
}: {
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="ul"
      aria-label={label}
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0,
        display: 'flex',
        flexWrap: 'wrap',
        columnGap: { xs: 2, sm: 2.5 },
        rowGap: 0.5
      }}
    >
      {children}
    </Box>
  )
}

/** A number then what it counts, or a label then a value when `before`. */
export function HeroStat({
  value,
  label,
  before = false,
  tone
}: {
  value: ReactNode
  label: string
  before?: boolean
  tone?: 'error' | undefined
}): ReactElement {
  const strong = (
    <Box
      component="strong"
      sx={{
        fontWeight: 600,
        color: tone === 'error' ? 'error.main' : 'text.primary',
        fontVariantNumeric: 'tabular-nums'
      }}
    >
      {value}
    </Box>
  )
  return (
    <Typography
      component="li"
      variant="body2"
      color="textSecondary"
      sx={{ whiteSpace: 'nowrap' }}
    >
      {before ? (
        <>
          {label} {strong}
        </>
      ) : (
        <>
          {strong} {label}
        </>
      )}
    </Typography>
  )
}

/** The share of done, started and late tasks, as one bar. */
export function ProgressSegments({
  label,
  text,
  done,
  started,
  late
}: {
  label: string
  text: string
  /** Shares of the whole, from 0 to 1. */
  done: number
  started: number
  late: number
}): ReactElement {
  const segments = [
    ['success.main', done],
    ['primary.main', started],
    ['error.main', late]
  ] as const
  return (
    <Box
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(done * 100)}
      aria-valuetext={text}
      sx={{
        display: 'flex',
        width: '100%',
        maxWidth: 420,
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        bgcolor: 'background.default'
      }}
    >
      {segments.map(([color, share]) => (
        <Box
          key={color}
          sx={theme => ({
            width: `${String(share * 100)}%`,
            bgcolor: color,
            ...motion(theme, ['width'])
          })}
        />
      ))}
    </Box>
  )
}
