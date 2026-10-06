import { Bottom, Icon, Left, Right } from '@linagora/twake-icons'
import {
  alpha,
  Box,
  Button,
  ButtonBase,
  IconButton,
  Typography
} from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

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
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
      <Typography
        variant="h5"
        component="h2"
        sx={{ flex: 1, textTransform: 'capitalize' }}
      >
        {title}
      </Typography>
      <Button variant="secondary" size="small" onClick={onToday}>
        {todayLabel}
      </Button>
      <IconButton size="small" aria-label={previousLabel} onClick={onPrevious}>
        <Icon icon={Left} size={14} />
      </IconButton>
      <IconButton size="small" aria-label={nextLabel} onClick={onNext}>
        <Icon icon={Right} size={14} />
      </IconButton>
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

export function DayCell({
  label,
  number,
  outside,
  today,
  children
}: {
  label: string
  number: number
  outside: boolean
  today: boolean
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="section"
      aria-label={label}
      aria-current={today ? 'date' : undefined}
      sx={{
        ...dayTone(outside),
        minHeight: '7rem',
        minWidth: 0,
        p: 0.5,
        display: 'grid',
        alignContent: 'start',
        gap: 0.5
      }}
    >
      <DayNumber number={number} today={today} />
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
  onSelect
}: {
  label: string
  number: number
  outside: boolean
  today: boolean
  selected: boolean
  marks: number
  onSelect: () => void
}): ReactElement {
  return (
    <ButtonBase
      aria-label={label}
      aria-current={today ? 'date' : undefined}
      aria-pressed={selected}
      onClick={onSelect}
      sx={{
        ...dayTone(outside),
        minHeight: '3.25rem',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        pt: 0.5,
        gap: 0.25
      }}
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

export function CalendarChip({
  done,
  onClick,
  children
}: {
  done: boolean
  onClick: () => void
  children: ReactNode
}): ReactElement {
  return (
    <ButtonBase
      className="CalendarChip"
      onClick={onClick}
      sx={theme => ({
        justifyContent: 'flex-start',
        minWidth: 0,
        px: 0.75,
        py: 0.25,
        borderRadius: 1,
        borderLeft: 3,
        borderColor: done ? 'divider' : 'primary.main',
        bgcolor: done
          ? 'action.hover'
          : alpha(theme.palette.primary.main, 0.08),
        color: done ? 'text.secondary' : 'text.primary',
        textDecoration: done ? 'line-through' : 'none',
        typography: 'caption',
        fontWeight: 500,
        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.16) }
      })}
    >
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
  children
}: {
  label: string
  count: number
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}): ReactElement {
  return (
    <Box component="section">
      <Typography variant="subtitle1" component="h2" sx={{ mb: 1 }}>
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
  children
}: {
  label: string
  empty: string
  children: ReactNode[]
}): ReactElement {
  return (
    <Box component="section" aria-label={label} sx={{ mt: 2 }}>
      <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
        {label}
      </Typography>
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
