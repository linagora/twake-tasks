import {
  Box,
  ButtonBase,
  Chip,
  Tooltip,
  Typography,
  type Theme
} from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

import { ICON } from '@/ds/BoardIcon'
import { useContrast } from '@/ds/contrast'
import { ACTION, COVER_RADIUS } from '@/ds/Pictures'

const CARD = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1.5,
  p: 1.75,
  borderRadius: COVER_RADIUS,
  border: 1,
  transition: 'border-color 120ms, box-shadow 120ms'
} as const

export function CardGrid({
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
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          sm: 'repeat(auto-fill, minmax(240px, 1fr))'
        },
        // Every row as tall as the tallest, the create card's too.
        gridAutoRows: '1fr',
        gap: 1.75,
        m: 0,
        p: 0,
        listStyle: 'none'
      }}
    >
      {children}
    </Box>
  )
}

// `title` is a link that stretches over the whole card; the controls sit
// above that stretch so they keep their own click.
export function BoardCard({
  label,
  title,
  icon,
  subtitle,
  flag,
  chip,
  done,
  doneLabel,
  meta,
  late,
  members,
  menu,
  star,
  starred,
  footerAction
}: {
  label: string
  title: ReactNode
  icon: ReactNode
  /** Where the board belongs; the line stays, empty, without it. */
  subtitle?: string | undefined
  /** A short word next to the title, such as "New". */
  flag?: string | undefined
  /** After `meta`, such as a template's. */
  chip?: ReactNode
  /** The share of its tasks done, from 0 to 1; null without tasks. */
  done: number | null
  doneLabel: string
  meta: string
  /** How many tasks are late, in the error tint. */
  late?: string | undefined
  members?: ReactNode
  /** At the top right, shown on hover or focus; touch screens always show it. */
  menu?: ReactNode
  /** After the name: always there when `starred`, else shown as the menu. */
  star?: ReactNode
  starred: boolean
  footerAction?: ReactNode
}): ReactElement {
  const { high } = useContrast()
  return (
    <Box
      component="li"
      aria-label={label}
      sx={{
        ...CARD,
        position: 'relative',
        minWidth: 0,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        '&:hover': { borderColor: 'primary.main', boxShadow: 1 },
        '&:has(a:focus-visible)': {
          outline: high ? 3 : 2,
          outlineColor: high ? 'text.primary' : 'primary.main',
          outlineOffset: 2
        },
        '& a': { color: 'text.primary', textDecoration: 'none' },
        '& a::after': { content: '""', position: 'absolute', inset: 0 },
        '& a:focus-visible': { outline: 'none' },
        '& [data-above]': { position: 'relative', zIndex: 1 },
        '& [data-card-menu]': { opacity: 0, transition: 'opacity 120ms' },
        // An open menu keeps an unstarred star shown.
        '&:hover [data-card-menu], &:focus-within [data-card-menu], &:has([aria-expanded="true"]) [data-card-menu]':
          { opacity: 1 },
        '@media (hover: none)': { '& [data-card-menu]': { opacity: 1 } }
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        {icon}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              // The hidden controls lie over the name's end, so the name
              // keeps the row; only what always shows takes its room.
              pr: star && starred ? 3 : 0,
              '@media (hover: none)': {
                pr: menu && star ? 6.5 : menu || star ? 3 : 0
              }
            }}
          >
            <Tooltip title={label} placement="top-start">
              <Typography
                variant="body2"
                component="h2"
                noWrap
                sx={{ minWidth: 0, fontWeight: 500 }}
              >
                {title}
              </Typography>
            </Tooltip>
            {flag && (
              <Chip
                size="small"
                color="primary"
                label={flag}
                sx={{ flexShrink: 0, height: 20, fontWeight: 600 }}
              />
            )}
            <Box
              sx={{
                position: 'absolute',
                zIndex: 1,
                top: (theme: Theme) => theme.spacing(1.75),
                right: (theme: Theme) => theme.spacing(1.75),
                height: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                '& .MuiIconButton-root': { p: 0.25 },
                '& > [data-card-menu]': { bgcolor: 'background.paper' }
              }}
            >
              {menu && <Box data-card-menu="">{menu}</Box>}
              {star && (
                <Box
                  data-card-menu={starred ? undefined : ''}
                  sx={{ display: 'flex' }}
                >
                  {star}
                </Box>
              )}
            </Box>
          </Box>
          <Typography
            variant="caption"
            component="p"
            color="textSecondary"
            noWrap
            sx={{ minHeight: '1lh' }}
          >
            {subtitle}
          </Typography>
        </Box>
      </Box>
      {done === null ? (
        <Box sx={{ height: 4 }} />
      ) : (
        <Box
          role="progressbar"
          aria-label={doneLabel}
          aria-valuenow={Math.round(done * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          sx={{
            height: 4,
            borderRadius: 4,
            bgcolor: 'background.default',
            overflow: 'hidden'
          }}
        >
          <Box
            sx={{
              height: '100%',
              width: `${String(done * 100)}%`,
              borderRadius: 4,
              bgcolor: 'primary.main'
            }}
          />
        </Box>
      )}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          minHeight: 24,
          mt: 'auto'
        }}
      >
        <Typography
          variant="caption"
          color="textSecondary"
          noWrap
          sx={{ minWidth: 0, mr: 'auto' }}
        >
          {meta}
        </Typography>
        {chip}
        {late && (
          <Chip
            size="small"
            label={late}
            sx={{
              flexShrink: 0,
              height: 20,
              fontSize: 11,
              color: 'error.main',
              bgcolor: (theme: Theme) =>
                theme.alpha(theme.vars.palette.error.main, 0.12)
            }}
          />
        )}
        {footerAction && <Box data-above="">{footerAction}</Box>}
        {members && (
          <Box data-above="" sx={{ flexShrink: 0 }}>
            {members}
          </Box>
        )}
      </Box>
    </Box>
  )
}

export function CreateCard({
  icon,
  title,
  text,
  onClick
}: {
  icon: ReactNode
  title: string
  text: string
  onClick: () => void
}): ReactElement {
  return (
    <Box component="li" sx={{ minWidth: 0, display: 'flex' }}>
      <ButtonBase
        onClick={onClick}
        sx={{
          ...CARD,
          ...ACTION,
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 1.25,
          textAlign: 'left',
          borderColor: 'transparent',
          '&:hover': { borderColor: 'primary.main' }
        }}
      >
        <Box
          sx={{
            ...ICON,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'primary.main',
            bgcolor: 'background.paper'
          }}
        >
          {icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            component="span"
            noWrap
            sx={{ display: 'block', fontWeight: 500 }}
          >
            {title}
          </Typography>
          <Typography
            variant="caption"
            component="span"
            color="textSecondary"
            sx={{
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 3,
              overflow: 'hidden'
            }}
          >
            {text}
          </Typography>
        </Box>
      </ButtonBase>
    </Box>
  )
}

export function TileGrid({
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
        display: 'grid',
        gap: 2,
        gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))'
      }}
    >
      {children}
    </Box>
  )
}

export function Tile({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 2,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        '&:focus-within, &:hover': { borderColor: 'primary.main' }
      }}
    >
      {children}
    </Box>
  )
}

export function BoardChip({
  label,
  hint
}: {
  label: string
  hint?: string
}): ReactElement {
  const chip = (
    <Chip
      size="small"
      label={label}
      tabIndex={hint ? 0 : undefined}
      sx={{ maxWidth: '100%', bgcolor: 'action.hover', color: 'text.primary' }}
    />
  )
  return hint ? (
    <Tooltip title={hint} describeChild>
      {chip}
    </Tooltip>
  ) : (
    chip
  )
}
