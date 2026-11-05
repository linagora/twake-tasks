import {
  Box,
  Button,
  ButtonBase,
  Skeleton,
  Tooltip,
  Typography
} from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

export function ProgressGrid({
  children
}: {
  children: ReactNode
}): ReactElement {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
        alignItems: 'start',
        pb: 2
      }}
    >
      {children}
    </Box>
  )
}

export function ProgressFailure({
  message,
  retry,
  onRetry
}: {
  message: string
  retry: string
  onRetry: () => void
}): ReactElement {
  return (
    <Box sx={{ py: 2 }}>
      <Typography role="alert" variant="body2" sx={{ mb: 1 }}>
        {message}
      </Typography>
      <Button variant="secondary" size="small" onClick={onRetry}>
        {retry}
      </Button>
    </Box>
  )
}

export function StatTiles({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box
      component="ul"
      sx={{
        display: 'grid',
        gap: 1.5,
        gridTemplateColumns: {
          xs: 'repeat(2, minmax(0, 1fr))',
          sm: 'repeat(3, minmax(0, 1fr))',
          lg: 'repeat(5, minmax(0, 1fr))'
        },
        listStyle: 'none',
        m: 0,
        mb: 2,
        p: 0
      }}
    >
      {children}
    </Box>
  )
}

/** A count; with `action`, a button showing the tasks it counts. */
export function StatTile({
  label,
  value,
  tone = 'default',
  action
}: {
  label: string
  value: number
  tone?: 'default' | 'error' | undefined
  action?: { label: string; onClick: () => void } | undefined
}): ReactElement {
  const content = (
    <>
      <Typography variant="body2" color="textSecondary" component="span">
        {label}
      </Typography>
      <Typography
        component="span"
        sx={{
          fontSize: 28,
          lineHeight: '36px',
          fontWeight: 600,
          color: tone === 'error' && value > 0 ? 'error.main' : 'text.primary'
        }}
      >
        {value}
      </Typography>
    </>
  )
  const tile = {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 0.5,
    p: 2,
    borderRadius: 3,
    bgcolor: 'background.default',
    textAlign: 'start'
  } as const
  return (
    <li>
      {action ? (
        <ButtonBase
          aria-label={action.label}
          onClick={action.onClick}
          sx={{
            ...tile,
            '&:hover': {
              boxShadow: theme =>
                `inset 0 0 0 1px ${theme.vars.palette.primary.main}`
            },
            '&.Mui-focusVisible': {
              outline: 2,
              outlineColor: 'primary.main',
              outlineOffset: 2
            }
          }}
        >
          {content}
        </ButtonBase>
      ) : (
        <Box sx={tile}>{content}</Box>
      )}
    </li>
  )
}

export function ProgressCard({
  title,
  children
}: {
  title: string
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="section"
      aria-label={title}
      sx={{
        p: 2.5,
        border: 1,
        borderColor: 'divider',
        borderRadius: 3,
        bgcolor: 'background.paper',
        minWidth: 0
      }}
    >
      <Typography variant="h6" component="h2" sx={{ fontWeight: 600, mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Box>
  )
}

/** A name, its count and share, over a bar as long as the share. */
export function ShareBar({
  name,
  value,
  share,
  label,
  tone = 'primary'
}: {
  name: ReactNode
  /** Shown at the end of the line, such as "4 · 40%". */
  value: string
  share: number
  /** What a screen reader says for the line. */
  label: string
  tone?: 'primary' | 'success'
}): ReactElement {
  return (
    <Box component="li" aria-label={label} sx={{ listStyle: 'none' }}>
      <Box
        aria-hidden
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          mb: 0.75
        }}
      >
        <Typography
          variant="body2"
          noWrap
          component="span"
          sx={{ minWidth: 0 }}
        >
          {name}
        </Typography>
        <Typography
          variant="body2"
          color="textSecondary"
          component="span"
          sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
        >
          {value}
        </Typography>
      </Box>
      <Box
        aria-hidden
        sx={{
          height: 8,
          borderRadius: 1,
          bgcolor: 'background.default',
          overflow: 'hidden'
        }}
      >
        <Box
          sx={{
            height: '100%',
            width: `${String(Math.round(share * 100))}%`,
            minWidth: share > 0 ? 4 : 0,
            borderRadius: 1,
            bgcolor: `${tone}.main`
          }}
        />
      </Box>
    </Box>
  )
}

export function ShareBars({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box
      component="ul"
      sx={{ display: 'flex', flexDirection: 'column', gap: 1.75, m: 0, p: 0 }}
    >
      {children}
    </Box>
  )
}

const BAR_AREA = 120

/** One bar per week, the count above it and the week below it. */
export function WeekBars({
  weeks,
  label
}: {
  weeks: {
    key: string
    done: number
    /** Under the bar, such as "Oct 6", and `tiny` ("10/6") on phones. */
    short: string
    tiny: string
    /** The bar's tooltip, and what a screen reader says for it. */
    long: string
    current: boolean
  }[]
  label: string
}): ReactElement {
  const most = Math.max(1, ...weeks.map(week => week.done))
  return (
    <Box
      component="ol"
      aria-label={label}
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${String(weeks.length)}, minmax(0, 1fr))`,
        gap: { xs: 0.5, sm: 1 },
        alignItems: 'end',
        m: 0,
        p: 0,
        listStyle: 'none'
      }}
    >
      {weeks.map(week => (
        <Tooltip key={week.key} title={week.long} disableInteractive>
          <Box
            component="li"
            aria-label={week.long}
            tabIndex={0}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.5,
              borderRadius: 1,
              '&:focus-visible': {
                outline: 2,
                outlineColor: 'primary.main'
              }
            }}
          >
            <Typography
              aria-hidden
              variant="caption"
              sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
            >
              {week.done}
            </Typography>
            <Box
              aria-hidden
              sx={{
                width: '100%',
                maxWidth: 32,
                height: Math.max(2, Math.round((week.done / most) * BAR_AREA)),
                borderRadius: '4px 4px 0 0',
                bgcolor: week.done > 0 ? 'primary.main' : 'divider',
                opacity: week.current || week.done === 0 ? 1 : 0.55
              }}
            />
            <Typography
              aria-hidden
              variant="caption"
              color={week.current ? 'textPrimary' : 'textSecondary'}
              noWrap
              sx={{
                maxWidth: '100%',
                fontSize: { xs: 11, sm: 12 },
                fontWeight: week.current ? 600 : undefined
              }}
            >
              <Box
                component="span"
                sx={{ display: { xs: 'none', sm: 'inline' } }}
              >
                {week.short}
              </Box>
              <Box component="span" sx={{ display: { sm: 'none' } }}>
                {week.tiny}
              </Box>
            </Typography>
          </Box>
        </Tooltip>
      ))}
    </Box>
  )
}

export function WeekBarsSkeleton({ label }: { label: string }): ReactElement {
  return (
    <Box
      role="progressbar"
      aria-label={label}
      sx={{ display: 'flex', alignItems: 'end', gap: 1, height: BAR_AREA + 40 }}
    >
      {[40, 70, 55, 90, 30, 80, 60, 100].map((height, index) => (
        <Skeleton
          key={index}
          variant="rounded"
          height={`${String(height)}%`}
          sx={{ flex: 1 }}
        />
      ))}
    </Box>
  )
}
