import { Bottom, Icon, Right } from '@linagora/twake-icons'
import { Box, ButtonBase, Paper, Typography } from '@linagora/twake-mui'
import type { HTMLAttributes, ReactElement, ReactNode, Ref } from 'react'

import { FittingChips, type FittingChip } from '@/ds/FittingChips'

// A list wide enough lines every row up in columns, the title keeping at
// least 10rem; a narrower one puts the facts on a second line under the
// title. The list's own width decides, since the sidebar narrows it.
const COLUMNS = '@container list (min-width: 56rem)'
const columnGrid = {
  gridTemplateColumns: '5rem minmax(0, 1fr) 6rem 7.5rem 7rem 11rem'
}
const rowGrid = {
  display: 'grid',
  alignItems: 'center',
  columnGap: 2,
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  px: 1.5
} as const

export function ListView({ children }: { children: ReactNode }): ReactElement {
  return <Box sx={{ container: 'list / inline-size' }}>{children}</Box>
}

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
        display: 'none',
        [COLUMNS]: { ...columnGrid, display: 'grid' },
        py: 1,
        mb: 1,
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
  highlighted = false,
  ...rest
}: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  label: string
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
  /** The task just created, standing out as a selected one. */
  highlighted?: boolean
}): ReactElement {
  return (
    <Box
      {...rest}
      ref={ref}
      component="li"
      aria-label={label}
      data-new-task={highlighted ? '' : undefined}
      sx={theme => ({
        ...rowGrid,
        [COLUMNS]: columnGrid,
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
        ...(highlighted && {
          bgcolor: theme.alpha(theme.vars.palette.primary.main, 0.08),
          '&:hover, &:focus-within': {
            bgcolor: theme.alpha(theme.vars.palette.primary.main, 0.12)
          }
        }),
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
        '& .ListRow-title button:focus-visible': { outline: 'none' }
      })}
    >
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
          display: 'flex',
          gridColumn: '1 / -1',
          minHeight: 24,
          alignItems: 'center',
          gap: 1,
          '&:empty': { display: 'none' },
          '& > *': { minWidth: 0 },
          [COLUMNS]: { display: 'contents' }
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
        '&:empty': { display: 'none' },
        [COLUMNS]: { '&:empty': { display: 'flex' } }
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
