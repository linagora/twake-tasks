import { Bottom, CalendarToday, Left, Plus, Right } from '@linagora/twake-icons'
import {
  Box,
  Button,
  ButtonBase,
  ButtonGroup,
  IconButton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
  type Theme
} from '@linagora/twake-mui'
import type { HTMLAttributes, ReactElement, ReactNode, Ref } from 'react'

import { useContrast } from '@/ds/contrast'
import { Icon } from '@/ds/Icon'

/** Creating an item in a day or a tray: what its button says, and does */
export interface CalendarAdd {
  label: string
  onAdd: () => void
}

function AddButton({
  add,
  className
}: {
  add: CalendarAdd
  className?: string
}): ReactElement {
  return (
    <Tooltip disableInteractive title={add.label}>
      <IconButton
        size="xsmall"
        className={className}
        aria-label={add.label}
        onClick={add.onAdd}
      >
        <Icon icon={Plus} size={12} />
      </IconButton>
    </Tooltip>
  )
}

// As in Twake Calendar: the step buttons around Today, then the period. A
// phone keeps icons only. Could go upstream to twake-ui with Calendar's.
export function CalendarToolbar({
  title,
  previousLabel,
  nextLabel,
  todayLabel,
  onPrevious,
  onNext,
  onToday
}: {
  title: string
  previousLabel: string
  nextLabel: string
  todayLabel: string
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
}): ReactElement {
  const theme = useTheme()
  const compact = useMediaQuery(theme.breakpoints.down('md'))
  const { high } = useContrast()

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
      {compact ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <IconButton aria-label={previousLabel} onClick={onPrevious}>
            <Icon icon={Left} size={16} />
          </IconButton>
          <Tooltip disableInteractive title={todayLabel}>
            <IconButton
              color="primary"
              size="small"
              aria-label={todayLabel}
              onClick={onToday}
              sx={{ border: 1, borderRadius: '12px', width: 38, height: 38 }}
            >
              <Icon icon={CalendarToday} size={16} />
            </IconButton>
          </Tooltip>
          <IconButton aria-label={nextLabel} onClick={onNext}>
            <Icon icon={Right} size={16} />
          </IconButton>
        </Box>
      ) : (
        <ButtonGroup
          variant="outlined"
          sx={theme => ({
            // Twake Calendar's outlined buttons: grey until hovered
            // Doubled: ButtonGroup's own border colours are more specific
            '&& .MuiButtonGroup-grouped': {
              bgcolor: 'background.paper',
              // Calendar's grey 900 at 28 %: Twake's theme has no greys
              borderColor: theme.alpha(theme.vars.palette.text.primary, 0.28),
              color: theme.alpha(theme.vars.palette.text.primary, 0.9),
              '&:hover': {
                bgcolor: theme.alpha(theme.vars.palette.primary.main, 0.04),
                borderColor: theme.alpha(theme.vars.palette.primary.main, 0.32),
                color: 'primary.main'
              }
            },
            '& button:first-of-type': { borderRadius: '12px 0 0 12px' },
            '& button:last-of-type': { borderRadius: '0 12px 12px 0' }
          })}
        >
          <Tooltip disableInteractive title={previousLabel}>
            <Button aria-label={previousLabel} onClick={onPrevious}>
              <Icon icon={Left} size={14} />
            </Button>
          </Tooltip>
          <Button onClick={onToday}>{todayLabel}</Button>
          <Tooltip disableInteractive title={nextLabel}>
            <Button aria-label={nextLabel} onClick={onNext}>
              <Icon icon={Right} size={14} />
            </Button>
          </Tooltip>
        </ButtonGroup>
      )}
      <Typography
        variant="h5"
        component="h2"
        sx={{
          flex: 1,
          minWidth: 0,
          fontSize: compact ? 18 : 22,
          fontWeight: 400,
          textTransform: 'capitalize'
        }}
        // High contrast wraps the month rather than cutting it
        noWrap={!high}
      >
        {title}
      </Typography>
    </Box>
  )
}

export function CalendarBody({
  aside,
  children
}: {
  aside: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          lg: 'minmax(0, 1fr) 15rem'
        },
        alignItems: 'start',
        gap: 3
      }}
    >
      <div>{children}</div>
      {aside}
    </Box>
  )
}

// The weekday names repeat what each day's label already says.
export function MonthGrid({
  weekdays,
  children
}: {
  weekdays: string[]
  children: ReactNode
}): ReactElement {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gap: '1px',
        bgcolor: 'divider',
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden'
      }}
    >
      {weekdays.map(weekday => (
        <Typography
          key={weekday}
          aria-hidden
          variant="caption"
          color="textSecondary"
          sx={{ bgcolor: 'background.paper', textAlign: 'center', py: 1 }}
        >
          {weekday}
        </Typography>
      ))}
      {children}
    </Box>
  )
}

function DayNumber({
  number,
  today,
  selected = false
}: {
  number: number
  today: boolean
  selected?: boolean
}): ReactElement {
  return (
    <Typography
      variant="caption"
      sx={{
        width: '1.75rem',
        height: '1.75rem',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        fontWeight: today || selected ? 600 : 400,
        color: today ? 'primary.contrastText' : 'inherit',
        bgcolor: today ? 'primary.main' : 'transparent',
        boxShadow: selected && !today ? 'inset 0 0 0 1.5px' : 'none'
      }}
    >
      {number}
    </Typography>
  )
}

const dayTone = (outside: boolean) => ({
  bgcolor: outside ? 'background.default' : 'background.paper',
  color: outside ? 'text.disabled' : 'text.secondary'
})

// Laid over the day's own background: the grid's lines show through a
// see-through one. An outline leaves the layout as it is.
const dropTarget = (theme: Theme) => ({
  backgroundImage: `linear-gradient(${theme.vars.palette.action.hover}, ${theme.vars.palette.action.hover})`,
  outline: `2px dashed ${theme.vars.palette.primary.main}`,
  outlineOffset: -2
})

/**
 * With `add`, a + shows on hover or focus, and a click on the empty part of
 * the day does the same: the + is what a keyboard reaches.
 */
export function DayCell({
  label,
  number,
  outside,
  today,
  add,
  ref,
  highlighted = false,
  children
}: {
  label: string
  number: number
  outside: boolean
  today: boolean
  add?: CalendarAdd | undefined
  ref?: Ref<HTMLElement>
  /** A task is being dragged over it. */
  highlighted?: boolean
  children: ReactNode
}): ReactElement {
  return (
    <Box
      ref={ref}
      role="group"
      aria-label={label}
      aria-current={today ? 'date' : undefined}
      onClick={
        add &&
        ((event: { target: EventTarget; currentTarget: EventTarget }) => {
          if (event.target === event.currentTarget) add.onAdd()
        })
      }
      sx={theme => ({
        ...dayTone(outside),
        minHeight: '7rem',
        minWidth: 0,
        p: 0.5,
        display: 'grid',
        gridAutoRows: 'min-content',
        alignContent: 'start',
        gap: 0.5,
        ...(add && {
          cursor: 'pointer',
          '@media (hover: hover)': { '& .DayCell-add': { opacity: 0 } },
          '&:hover .DayCell-add, & .DayCell-add:focus-visible': { opacity: 1 }
        }),
        ...(highlighted && dropTarget(theme))
      })}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pointerEvents: 'none',
          '& button': { pointerEvents: 'auto' }
        }}
      >
        <DayNumber number={number} today={today} />
        {add && <AddButton add={add} className="DayCell-add" />}
      </Box>
      {children}
    </Box>
  )
}

export function DayButton({
  label,
  number,
  outside,
  today,
  selected,
  marks,
  onSelect,
  ref,
  highlighted = false
}: {
  label: string
  number: number
  outside: boolean
  today: boolean
  selected: boolean
  marks: number
  onSelect: () => void
  ref?: Ref<HTMLButtonElement>
  /** A task is being dragged over it. */
  highlighted?: boolean
}): ReactElement {
  return (
    <ButtonBase
      ref={ref}
      aria-label={label}
      aria-current={today ? 'date' : undefined}
      aria-pressed={selected}
      onClick={onSelect}
      sx={theme => ({
        ...dayTone(outside),
        minHeight: '3.25rem',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        pt: 0.5,
        gap: 0.25,
        ...(highlighted && dropTarget(theme))
      })}
    >
      <DayNumber number={number} today={today} selected={selected} />
      <Box sx={{ display: 'flex', gap: '3px', height: 5 }}>
        {Array.from({ length: Math.min(marks, 3) }, (_, index) => (
          <Box
            key={index}
            sx={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              bgcolor: 'primary.main'
            }}
          />
        ))}
      </Box>
    </ButtonBase>
  )
}

/** What makes a chip draggable, spread on it. */
export type ChipDrag = HTMLAttributes<HTMLElement> & {
  ref: (node: HTMLElement | null) => void
  /** It stays in place, dimmed, while its preview is dragged. */
  dragging: boolean
}

export function CalendarChip({
  done,
  highlighted = false,
  onClick,
  drag,
  children
}: {
  done: boolean
  /** The task just created, standing out as a selected one. */
  highlighted?: boolean
  onClick: () => void
  drag?: ChipDrag | undefined
  children: ReactNode
}): ReactElement {
  const { dragging = false, ...draggable } = drag ?? {}
  return (
    <ButtonBase
      className="CalendarChip"
      data-new-task={highlighted ? '' : undefined}
      onClick={onClick}
      {...draggable}
      // Space picks the chip up, so its release must not also open it, as a
      // button does. Enter still opens it.
      onKeyUp={
        drag &&
        ((event: { key: string; preventDefault: () => void }) => {
          if (event.key === ' ') event.preventDefault()
        })
      }
      sx={theme => ({
        opacity: dragging ? 0.4 : 1,
        justifyContent: 'flex-start',
        gap: 0.75,
        minWidth: 0,
        px: 0.5,
        py: 0.25,
        borderRadius: 1,
        color: done ? 'text.secondary' : 'text.primary',
        textDecoration: done ? 'line-through' : 'none',
        typography: 'caption',
        '&:hover': { bgcolor: 'action.hover' },
        '&:focus-visible': {
          outline: `2px solid ${theme.vars.palette.primary.main}`,
          outlineOffset: -2
        },
        ...(highlighted && {
          bgcolor: theme.alpha(theme.vars.palette.primary.main, 0.12),
          '&:hover': {
            bgcolor: theme.alpha(theme.vars.palette.primary.main, 0.16)
          }
        })
      })}
    >
      <Box
        component="span"
        aria-hidden
        sx={theme => ({
          flexShrink: 0,
          width: '0.75rem',
          height: '0.75rem',
          borderRadius: 0.5,
          bgcolor: done
            ? 'action.disabledBackground'
            : theme.alpha(theme.vars.palette.primary.main, 0.24)
        })}
      />
      <Box
        component="span"
        sx={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {children}
      </Box>
    </ButtonBase>
  )
}

export function CalendarTray({
  label,
  count,
  expanded,
  onToggle,
  add,
  ref,
  highlighted = false,
  children
}: {
  label: string
  count: number
  expanded: boolean
  onToggle: () => void
  add?: CalendarAdd | undefined
  ref?: Ref<HTMLElement>
  /** A task is being dragged over it. */
  highlighted?: boolean
  children: ReactNode
}): ReactElement {
  return (
    <Box
      ref={ref}
      component="section"
      sx={theme => ({
        borderRadius: 2,
        ...(highlighted && dropTarget(theme))
      })}
    >
      <Typography
        variant="subtitle1"
        component="h2"
        sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}
      >
        <ButtonBase
          aria-expanded={expanded}
          onClick={onToggle}
          sx={{
            gap: 1,
            px: 1,
            py: 0.5,
            ml: -1,
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
        {add && <AddButton add={add} />}
      </Typography>
      {expanded && (
        <ChipList label={label} roomy>
          {children}
        </ChipList>
      )}
    </Box>
  )
}

export function DayAgenda({
  label,
  empty,
  add,
  children
}: {
  label: string
  empty: string
  add?: CalendarAdd | undefined
  children: ReactNode[]
}): ReactElement {
  return (
    <Box component="section" aria-label={label} sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        <Typography variant="subtitle2" component="h3">
          {label}
        </Typography>
        {add && <AddButton add={add} />}
      </Box>
      {children.length > 0 ? (
        <ChipList roomy>{children}</ChipList>
      ) : (
        <Typography variant="body2" color="textSecondary">
          {empty}
        </Typography>
      )}
    </Box>
  )
}

export function ChipList({
  label,
  roomy = false,
  children
}: {
  label?: string
  roomy?: boolean
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="ul"
      aria-label={label}
      sx={{
        listStyle: 'none',
        p: 0,
        m: 0,
        display: 'grid',
        gap: roomy ? 0.75 : 0.5,
        '& > li': { display: 'grid', minWidth: 0 },
        ...(roomy && {
          '& .CalendarChip': { px: 1.25, py: 0.75, typography: 'body2' }
        })
      }}
    >
      {children}
    </Box>
  )
}
