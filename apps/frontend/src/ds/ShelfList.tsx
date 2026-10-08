import { Box, Tooltip, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

// Wide screens line every row up in columns; phones put the facts on a
// second line under the title, with the action beside both.
const shelfGrid = {
  display: 'grid',
  alignItems: 'center',
  columnGap: 2,
  gridTemplateColumns: {
    xs: 'minmax(0, 1fr) auto',
    md: '5rem minmax(0, 1fr) 6rem 4rem 10rem 11rem 7rem'
  },
  px: 1.5
} as const

export function ShelfHeader({
  columns
}: {
  columns: [string, string, string, string, string]
}): ReactElement {
  return (
    <Box
      aria-hidden
      sx={{
        ...shelfGrid,
        display: { xs: 'none', md: 'grid' },
        py: 1,
        borderBottom: 1,
        borderColor: 'divider'
      }}
    >
      {columns.map((column, index) => (
        <Typography
          key={column}
          variant="caption"
          color="textSecondary"
          sx={{ gridColumn: index === 0 ? 'span 2' : undefined }}
        >
          {column}
        </Typography>
      ))}
    </Box>
  )
}

export function ShelfList({
  label,
  children
}: {
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <Box component="ul" aria-label={label} sx={{ m: 0, p: 0 }}>
      {children}
    </Box>
  )
}

export function ShelfRow({
  label,
  taskKey,
  title,
  people,
  priority,
  labels,
  when,
  action
}: {
  label: string
  taskKey: string
  title: ReactNode
  people: ReactNode
  priority: ReactNode
  labels: ReactNode
  when: ReactNode
  action: ReactNode
}): ReactElement {
  return (
    <Box
      component="li"
      aria-label={label}
      sx={{
        ...shelfGrid,
        position: 'relative',
        listStyle: 'none',
        minHeight: 52,
        py: { xs: 1, md: 0.75 },
        rowGap: 0.5,
        borderBottom: 1,
        borderColor: 'divider',
        transition: 'background-color 120ms',
        '&:hover, &:focus-within': { bgcolor: 'action.hover' },
        // Phones give long titles a second line.
        '& .ShelfRow-title button': {
          display: { xs: '-webkit-box', md: 'block' },
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: { xs: 'normal', md: 'nowrap' }
        },
        '& .ShelfRow-title button::after': {
          content: '""',
          position: 'absolute',
          inset: 0
        },
        '& .ShelfRow-title button:focus-visible': { outline: 'none' },
        '& .ShelfRow-action': { position: 'relative', zIndex: 1 }
      }}
    >
      <Box
        sx={{
          display: { xs: 'flex', md: 'contents' },
          alignItems: 'baseline',
          gap: 1,
          minWidth: 0
        }}
      >
        <Typography
          variant="caption"
          color="textSecondary"
          noWrap
          sx={{ flexShrink: 0 }}
        >
          {taskKey}
        </Typography>
        <Box className="ShelfRow-title" sx={{ minWidth: 0 }}>
          {title}
        </Box>
      </Box>
      <Box
        sx={{
          display: { xs: 'flex', md: 'contents' },
          gridColumn: { xs: '1', md: 'auto' },
          gridRow: { xs: '2', md: 'auto' },
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1,
          '& > *': { minWidth: 0 }
        }}
      >
        <Cell>{people}</Cell>
        <Cell>{priority}</Cell>
        <Cell wrap>{labels}</Cell>
        <Cell>{when}</Cell>
      </Box>
      <Box
        className="ShelfRow-action"
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          gridColumn: { xs: '2', md: 'auto' },
          gridRow: { xs: '1 / span 2', md: 'auto' }
        }}
      >
        {action}
      </Box>
    </Box>
  )
}

export function ShelfWhen({
  date,
  ago,
  note,
  tone = 'textSecondary'
}: {
  date: string
  ago: string
  note?: string | undefined
  tone?: 'textSecondary' | 'warning' | 'error'
}): ReactElement {
  return (
    <Tooltip title={date}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap>
          {ago}
        </Typography>
        {note && (
          <Typography
            variant="caption"
            component="p"
            color={tone}
            noWrap
            sx={{ fontWeight: tone === 'textSecondary' ? 400 : 500 }}
          >
            {note}
          </Typography>
        )}
      </Box>
    </Tooltip>
  )
}

function Cell({
  wrap = false,
  children
}: {
  wrap?: boolean
  children: ReactNode
}): ReactElement {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        flexWrap: wrap ? 'wrap' : 'nowrap',
        '&:empty': { display: { xs: 'none', md: 'flex' } }
      }}
    >
      {children}
    </Box>
  )
}
