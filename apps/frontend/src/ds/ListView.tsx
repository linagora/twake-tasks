import { Bottom, Icon, Right } from '@linagora/twake-icons'
import { Box, ButtonBase, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

import { FittingChips, type FittingChip } from '@/ds/FittingChips'

// Wide screens line every row up in columns; phones put the facts on a
// second line under the title.
const rowGrid = {
  display: 'grid',
  alignItems: 'center',
  columnGap: 2,
  gridTemplateColumns: {
    xs: '32px auto minmax(0, 1fr)',
    md: '32px 5rem minmax(0, 1fr) 6rem 7.5rem 7rem 11rem'
  },
  px: 1.5
} as const

export function ListHeader({
  columns
}: {
  columns: [string, string, string, string, string]
}): ReactElement {
  return (
    <Box
      aria-hidden
      sx={{
        ...rowGrid,
        display: { xs: 'none', md: 'grid' },
        py: 1,
        mb: 1,
        borderBottom: 1,
        borderColor: 'divider'
      }}
    >
      <span />
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

export function ListSection({
  label,
  count,
  expanded,
  onToggle,
  footer,
  children
}: {
  label: string
  count: number
  expanded: boolean
  onToggle: () => void
  footer?: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <Box component="section" sx={{ mb: 2 }}>
      <Typography variant="subtitle1" component="h2" sx={{ mb: 0.5 }}>
        <ButtonBase
          aria-expanded={expanded}
          onClick={onToggle}
          sx={{
            gap: 1,
            px: 1,
            py: 0.5,
            borderRadius: 1,
            font: 'inherit',
            fontWeight: 600,
            '&:hover': { bgcolor: 'action.hover' }
          }}
        >
          <Icon icon={expanded ? Bottom : Right} size={12} />
          {label}{' '}
          <Typography component="span" variant="caption" color="textSecondary">
            {count}
          </Typography>
        </ButtonBase>
      </Typography>
      {expanded && (
        <>
          <Box component="ul" aria-label={label} sx={{ m: 0, p: 0 }}>
            {children}
          </Box>
          {footer}
        </>
      )}
    </Box>
  )
}

export function ListRow({
  label,
  check,
  taskKey,
  title,
  done,
  people,
  due,
  priority,
  labels,
  moreLabels
}: {
  label: string
  check: ReactNode
  taskKey: string
  title: ReactNode
  done: boolean
  people: ReactNode
  due: ReactNode
  priority: ReactNode
  labels: FittingChip[]
  moreLabels: (count: number, names: string) => string
}): ReactElement {
  return (
    <Box
      component="li"
      aria-label={label}
      sx={{
        ...rowGrid,
        position: 'relative',
        listStyle: 'none',
        minHeight: 44,
        py: 0.5,
        borderBottom: 1,
        borderColor: 'divider',
        '&:hover, &:focus-within': { bgcolor: 'action.hover' },
        '& .ListRow-title button': {
          display: 'block',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textDecoration: 'inherit'
        },
        '& .ListRow-title button::after': {
          content: '""',
          position: 'absolute',
          inset: 0
        },
        '& .ListRow-title button:focus-visible': { outline: 'none' },
        '& .ListRow-check': { position: 'relative', zIndex: 1 }
      }}
    >
      <Box
        className="ListRow-check"
        sx={{ gridRow: { xs: 'span 2', md: 'auto' } }}
      >
        {check}
      </Box>
      <Typography variant="caption" color="textSecondary" noWrap>
        {taskKey}
      </Typography>
      <Box
        className="ListRow-title u-ellipsis"
        sx={{
          minWidth: 0,
          color: done ? 'text.secondary' : 'text.primary',
          textDecoration: done ? 'line-through' : 'none'
        }}
      >
        {title}
      </Box>
      <Box
        sx={{
          display: { xs: 'flex', md: 'contents' },
          gridColumn: { xs: '2 / -1', md: 'auto' },
          alignItems: 'center',
          gap: 1,
          '&:empty': { display: 'none' },
          '& > *': { minWidth: 0 }
        }}
      >
        <Cell>{people}</Cell>
        <Cell>{due}</Cell>
        <Cell>{priority}</Cell>
        <Box sx={{ flex: '1 1 0', minWidth: 0 }}>
          {labels.length > 0 && (
            <FittingChips chips={labels} moreLabel={moreLabels} />
          )}
        </Box>
      </Box>
    </Box>
  )
}

function Cell({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        '&:empty': { display: { xs: 'none', md: 'flex' } }
      }}
    >
      {children}
    </Box>
  )
}
