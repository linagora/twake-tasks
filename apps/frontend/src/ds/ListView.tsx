import { Bottom, Icon, Right } from '@linagora/twake-icons'
import {
  Box,
  ButtonBase,
  Paper,
  TableSortLabel,
  Typography
} from '@linagora/twake-mui'
import type { HTMLAttributes, ReactElement, ReactNode, Ref } from 'react'

import { FittingChips, type FittingChip } from '@/ds/FittingChips'

// A list wide enough lines every row up in columns, the title keeping at
// least 10rem; a narrower one puts the facts on a second line under the
// title. The list's own width decides, since the sidebar narrows it.
const COLUMNS = '@container list (min-width: 56rem)'
const columnGrid = {
  gridTemplateColumns: '32px 5rem minmax(0, 1fr) 6rem 7.5rem 7rem 11rem'
}
const rowGrid = {
  display: 'grid',
  alignItems: 'center',
  columnGap: 2,
  gridTemplateColumns: '32px auto minmax(0, 1fr)',
  px: 1.5
} as const

export function ListView({ children }: { children: ReactNode }): ReactElement {
  return <Box sx={{ container: 'list / inline-size' }}>{children}</Box>
}

export interface ListColumn {
  name: string
  /** Its order, `null` when the list is not sorted by it. */
  sorted: 'asc' | 'desc' | null
  /** What a click on it does, to read to those who cannot see the arrow. */
  sortLabel: string
  onSort: () => void
}

/**
 * The names of the columns, each sorting the list on a click as in Twake
 * Drive: its arrow shows on hover, and stays on the column sorted.
 */
export function ListHeader({
  label,
  columns
}: {
  label: string
  columns: [ListColumn, ListColumn, ListColumn, ListColumn, ListColumn]
}): ReactElement {
  return (
    <Box
      role="group"
      aria-label={label}
      sx={{
        // Narrow, the facts go under the titles, and the sort a row of its own.
        display: 'flex',
        flexWrap: 'wrap',
        columnGap: 2,
        px: 1.5,
        [COLUMNS]: { ...rowGrid, ...columnGrid },
        py: 1,
        mb: 1,
        borderBottom: 1,
        borderColor: 'divider'
      }}
    >
      <Box
        component="span"
        sx={{ display: 'none', [COLUMNS]: { display: 'block' } }}
      />
      {columns.map((column, index) => (
        <Typography
          key={column.name}
          variant="caption"
          color="textSecondary"
          sx={{ gridColumn: index === 0 ? 'span 2' : undefined }}
        >
          <TableSortLabel
            active={column.sorted !== null}
            direction={column.sorted ?? 'asc'}
            aria-label={column.sortLabel}
            onClick={column.onSort}
            sx={{ font: 'inherit', color: 'inherit' }}
          >
            {column.name}
          </TableSortLabel>
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
  edits = {},
  ref,
  drag = 'none',
  highlighted = false,
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
  /** The cells a click edits, each with its own picker. */
  edits?: Partial<Record<EditableCell, CellEdit>> | undefined
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
        // Static, so that its stretch covers the whole row: a click anywhere
        // on the row opens the task, as on a card.
        '& .ListRow-title button': {
          position: 'static',
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
        '& .ListRow-check, & .ListCell-button': {
          position: 'relative',
          zIndex: 1
        }
      })}
    >
      <Box
        className="ListRow-check"
        sx={{ gridRow: 'span 2', [COLUMNS]: { gridRow: 'auto' } }}
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
          display: 'flex',
          gridColumn: '2 / -1',
          minHeight: 24,
          alignItems: 'center',
          gap: 1,
          '&:empty': { display: 'none' },
          '& > *': { minWidth: 0 },
          [COLUMNS]: { display: 'contents' }
        }}
      >
        <Cell edit={edits.people}>{people}</Cell>
        <Cell edit={edits.due}>{due}</Cell>
        <Cell edit={edits.priority}>{priority}</Cell>
        <Box sx={{ flex: '1 1 0', minWidth: 0, display: 'flex' }}>
          {edits.labels ? (
            <CellButton {...edits.labels} empty={labels.length === 0}>
              {labels.length > 0 && (
                <FittingChips chips={labels} moreLabel={moreLabels} />
              )}
            </CellButton>
          ) : (
            labels.length > 0 && (
              <FittingChips chips={labels} moreLabel={moreLabels} />
            )
          )}
        </Box>
      </Box>
    </Box>
  )
}

function Cell({
  edit,
  children
}: {
  edit: CellEdit | undefined
  children: ReactNode
}): ReactElement {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        // Under the title, a cell with nothing to show leaves no gap.
        '&:empty, &:has(> .ListCell-empty)': { display: 'none' },
        [COLUMNS]: {
          '&:empty, &:has(> .ListCell-empty)': { display: 'flex' }
        }
      }}
    >
      {edit ? (
        <CellButton {...edit} empty={!hasContent(children)}>
          {children}
        </CellButton>
      ) : (
        children
      )}
    </Box>
  )
}

const hasContent = (node: ReactNode): boolean =>
  node !== null && node !== undefined && node !== false && node !== ''

export type EditableCell = 'people' | 'due' | 'priority' | 'labels'

export interface CellEdit {
  label: string
  onClick: (anchor: HTMLElement) => void
}

/**
 * A cell that edits what it shows on a click, above the row's own link,
 * which opens the task from anywhere else.
 */
function CellButton({
  label,
  empty,
  onClick,
  children
}: CellEdit & { empty: boolean; children: ReactNode }): ReactElement {
  return (
    <ButtonBase
      aria-label={label}
      aria-haspopup="dialog"
      className={empty ? 'ListCell-button ListCell-empty' : 'ListCell-button'}
      onClick={event => {
        onClick(event.currentTarget)
      }}
      sx={theme => ({
        flex: '1 1 auto',
        minWidth: 0,
        minHeight: 32,
        justifyContent: 'flex-start',
        gap: 0.5,
        mx: -0.5,
        px: 0.5,
        borderRadius: 1,
        '&:hover': { bgcolor: 'action.selected' },
        '&:focus-visible': {
          outline: `2px solid ${theme.vars.palette.primary.main}`
        }
      })}
    >
      {children}
    </ButtonBase>
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
