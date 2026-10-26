import {
  Box,
  Card,
  CardActionArea,
  Chip,
  Tooltip,
  Typography
} from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

import { backdropOf } from '@/ds/Pictures'

const CARD_RADIUS = '20px'

const SHADOW = 'rgb(0 0 0 / 0.55)'

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
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 2,
        m: 0,
        p: 0,
        listStyle: 'none'
      }}
    >
      {children}
    </Box>
  )
}

// `title` is a link that stretches over the whole card; `action` sits above
// that stretch so it keeps its own click.
export function BoardCard({
  label,
  title,
  flag,
  chip,
  tag,
  meta,
  members,
  action,
  footerAction,
  cover,
  lightCover = false
}: {
  label: string
  title: ReactNode
  /** A short word next to the title, such as "New". */
  flag?: string | undefined
  /** Where the board belongs, when that tells something: personal, a space. */
  chip?: ReactNode
  tag: string
  meta: string
  /** The people of the board, at the end of its last row. */
  members?: ReactNode
  action?: ReactNode
  /** On the last row, before the people. */
  footerAction?: ReactNode
  /** The picture along the top, with the name on it. */
  cover: string
  /** A pale `cover`, on which the name is dark. */
  lightCover?: boolean
}): ReactElement {
  return (
    <Card
      component="li"
      aria-label={label}
      sx={{
        minHeight: { sm: 144 },
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        p: 1.5,
        borderRadius: CARD_RADIUS,
        '&:hover': { boxShadow: 3 },
        '& a': { color: 'text.primary', textDecoration: 'none' },
        '& a::after': { content: '""', position: 'absolute', inset: 0 },
        '&:focus-within': {
          outline: 2,
          outlineColor: 'primary.main',
          outlineOffset: -2
        },
        '& a:focus-visible': { outline: 'none' }
      }}
    >
      <Box
        data-testid="board-cover"
        sx={{
          ...backdropOf(cover),
          // The picture keeps its colours: a grey shadow around the white name
          // and menu keeps them readable on a dark one, a pale one takes them
          // dark.
          ...(lightCover
            ? { color: 'grey.900' }
            : {
                color: 'common.white',
                textShadow: `0 0 2px ${SHADOW}, 0 1px 6px ${SHADOW}`,
                '& svg': { filter: `drop-shadow(0 0 2px ${SHADOW})` }
              }),
          minHeight: 88,
          mt: -1.5,
          mx: -1.5,
          p: 1.5,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 1.5,
          borderTopLeftRadius: CARD_RADIUS,
          borderTopRightRadius: CARD_RADIUS,
          '&& a': { color: 'inherit' },
          '&& .MuiIconButton-root': { color: 'inherit' }
        }}
      >
        <Tooltip title={label} placement="top-start">
          <Typography
            variant="h6"
            component="h3"
            sx={{
              flex: '1 1 auto',
              minWidth: 0,
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              overflowWrap: 'anywhere'
            }}
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
        {action && (
          <Box sx={{ position: 'relative', zIndex: 1, m: -0.5 }}>{action}</Box>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography
          variant="caption"
          sx={{
            px: 0.75,
            borderRadius: 1,
            fontWeight: 600,
            letterSpacing: '0.04em',
            color: 'text.secondary',
            bgcolor: 'action.hover'
          }}
        >
          {tag}
        </Typography>
        <Typography variant="caption" color="textSecondary" noWrap>
          {meta}
        </Typography>
      </Box>
      {/* Above the stretched link, so the pointer reaches the tooltips. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mt: 'auto',
          '& > *': { position: 'relative', zIndex: 1 }
        }}
      >
        {chip}
        <Box sx={{ ml: 'auto' }}>{footerAction}</Box>
        <Box>{members}</Box>
      </Box>
    </Card>
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
    <Card
      component="li"
      sx={{ minHeight: { sm: 144 }, borderRadius: CARD_RADIUS }}
    >
      <CardActionArea
        onClick={onClick}
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 1,
          p: 1.5,
          textAlign: 'center'
        }}
      >
        <Box component="span" sx={{ display: 'flex', color: 'primary.main' }}>
          {icon}
        </Box>
        <Typography variant="h6" component="span" noWrap sx={{ maxWidth: 1 }}>
          {title}
        </Typography>
        <Typography variant="body2" component="span" color="textSecondary">
          {text}
        </Typography>
      </CardActionArea>
    </Card>
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
