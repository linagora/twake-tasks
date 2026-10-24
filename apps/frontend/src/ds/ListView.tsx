import { Bottom, Icon, Right } from '@linagora/twake-icons'
import { Box, ButtonBase, Paper, Typography } from '@linagora/twake-mui'
import type { HTMLAttributes, ReactElement, ReactNode, Ref } from 'react'

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
  ref,
  highlighted = false,
  children
}: {
  label: string
  count: number
  expanded: boolean
  onToggle: () => void
  footer?: ReactNode
  ref?: Ref<HTMLElement>
  /** A task dragged over it would land in it. */
  highlighted?: boolean
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="section"
      ref={ref}
      sx={theme => ({
        mb: 2,
        borderRadius: 1,
        transition: 'background-color 120ms',
        ...(highlighted && {
          bgcolor: theme.alpha(theme.vars.palette.primary.main, 0.08)
        })
      })}
    >
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
  moreLabels,
  ref,
  drag = 'none',
  ...rest
}: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
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
  ref?: Ref<HTMLElement>
  /** `placeholder` is the slot a dragged row leaves, faded as in Twake Drive. */
  drag?: 'none' | 'placeholder'
}): ReactElement {
  return (
    <Box
      {...rest}
      ref={ref}
      component="li"
      aria-label={label}
      sx={theme => ({
        ...rowGrid,
        position: 'relative',
        listStyle: 'none',
        minHeight: 44,
        py: 0.5,
        borderBottom: 1,
        borderColor: 'divider',
        '&:hover, &:focus-within': { bgcolor: 'action.hover' },
        '&:focus-visible': {
          outline: `2px solid ${theme.vars.palette.primary.main}`,
          outlineOffset: -2
        },
        ...(drag === 'placeholder' && { opacity: 0.5 }),
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
      })}
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
          minHeight: { xs: 24, md: 'auto' },
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

/**
 * The row under the pointer while it is dragged: its key and title on a
 * sheet as wide as they are, as Twake Drive shows a file being moved.
 */
export function ListDragPreview({
  taskKey,
  title
}: {
  taskKey: string
  title: string
}): ReactElement {
  return (
    <Paper
      elevation={8}
      className="u-flex u-flex-items-center u-p-half"
      sx={{
        width: 'fit-content',
        maxWidth: 'min(16rem, 60vw)',
        gap: 1,
        cursor: 'grabbing'
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
      <Typography variant="body2" noWrap>
        {title}
      </Typography>
    </Paper>
  )
}
