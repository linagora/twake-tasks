import {
  Avatar,
  Box,
  ButtonBase,
  Chip,
  nameToColor,
  Tooltip,
  Typography
} from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

import { HIGH_CONTRAST_AVATAR, useContrast } from '@/ds/contrast'
import { ACTION, backdropOf, COVER_RADIUS, NO_COVER } from '@/ds/Pictures'

// Twake Board's card, the preview at the top and the name under it.
const PREVIEW = {
  height: { xs: 120, sm: 144 },
  borderRadius: COVER_RADIUS,
  border: 1,
  borderColor: 'divider',
  transition: 'border-color 120ms'
} as const

const CARD = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1.5,
  p: 1.75,
  borderRadius: COVER_RADIUS,
  border: 1,
  transition: 'border-color 120ms, box-shadow 120ms'
} as const

const ICON = { width: 36, height: 36, borderRadius: '10px', flexShrink: 0 }

/**
 * A board's picture or color, or for a board without, its initials on a
 * color of the Twake avatars picked from its name.
 */
export function BoardIcon({
  name,
  cover
}: {
  name: string
  cover: string | null
}): ReactElement {
  const { high } = useContrast()
  if (cover) {
    return (
      <Box
        data-testid="board-icon"
        aria-hidden
        sx={{ ...ICON, ...backdropOf(cover) }}
      />
    )
  }
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase()
  return (
    <Avatar
      data-testid="board-icon"
      aria-hidden
      variant="rounded"
      size={36}
      color={high ? HIGH_CONTRAST_AVATAR : (nameToColor(name) ?? 'none')}
      sx={{ ...ICON, fontSize: 13, fontWeight: 600 }}
    >
      {initials}
    </Avatar>
  )
}

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

// `title` is a link that stretches over the whole card; `menu` sits above
// that stretch so it keeps its own click.
export function BoardCard({
  label,
  title,
  flag,
  chip,
  meta,
  members,
  menu,
  star,
  footerAction,
  cover
}: {
  label: string
  title: ReactNode
  /** A short word next to the title, such as "New". */
  flag?: string | undefined
  /** Where the board belongs, when that tells something: personal, a space. */
  chip?: ReactNode
  meta: string
  /** The people of the board, at the end of the name's row. */
  members?: ReactNode
  /** At the top right, shown on hover or focus; touch screens always show it. */
  menu?: ReactNode
  /** Left of the menu, shown when it is. */
  star?: ReactNode
  /** On the last row, after the chip. */
  footerAction?: ReactNode
  /** The picture or color of the preview, null for none. */
  cover: string | null
}): ReactElement {
  const { high } = useContrast()
  return (
    <Box
      component="li"
      aria-label={label}
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        '& a': { color: 'text.primary', textDecoration: 'none' },
        '& a::after': { content: '""', position: 'absolute', inset: 0 },
        '&:hover [data-testid="board-cover"]': { borderColor: 'primary.main' },
        '&:has(a:focus-visible) [data-testid="board-cover"]': {
          outline: high ? 3 : 2,
          outlineColor: high ? 'text.primary' : 'primary.main',
          outlineOffset: 2
        },
        '& a:focus-visible': { outline: 'none' },
        '& [data-card-menu]': { opacity: 0, transition: 'opacity 120ms' },
        // An open menu keeps the star beside it.
        '&:hover [data-card-menu], &:focus-within [data-card-menu], &:has([aria-expanded="true"]) [data-card-menu]':
          { opacity: 1 },
        '@media (hover: none)': { '& [data-card-menu]': { opacity: 1 } }
      }}
    >
      <Box
        data-testid="board-cover"
        sx={{ ...PREVIEW, ...(cover ? backdropOf(cover) : NO_COVER) }}
      />
      {(star ?? menu) && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 1,
            display: 'flex',
            gap: 0.5,
            // On a surface of the theme, readable on any cover.
            '& .MuiIconButton-root': {
              bgcolor: 'background.paper',
              boxShadow: 1,
              '&:hover': { bgcolor: 'background.paper' }
            }
          }}
        >
          {star && <Box data-card-menu="">{star}</Box>}
          {menu && <Box data-card-menu="">{menu}</Box>}
        </Box>
      )}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          pt: 1.5,
          minWidth: 0
        }}
      >
        <Tooltip title={label} placement="top-start">
          <Typography
            variant="body1"
            component="h2"
            noWrap
            sx={{ flex: '0 1 auto', minWidth: 0, lineHeight: '24px' }}
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
        {/* Above the stretched link, so the pointer reaches the tooltips. */}
        <Box
          sx={{ ml: 'auto', flexShrink: 0, position: 'relative', zIndex: 1 }}
        >
          {members}
        </Box>
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          minHeight: 24,
          '& > :not(:first-child)': { position: 'relative', zIndex: 1 }
        }}
      >
        <Typography variant="body2" color="textSecondary" noWrap>
          {meta}
        </Typography>
        {chip}
        {footerAction}
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
        <Box sx={{ minWidth: 0 }}>
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
            noWrap
            sx={{ display: 'block' }}
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
