import { Box, Button, Skeleton, styled, Typography } from '@linagora/twake-mui'
import {
  useId,
  type HTMLAttributes,
  type KeyboardEventHandler,
  type ReactElement,
  type ReactNode,
  type Ref
} from 'react'

import { Highlight } from '@/ds/Highlight'

export function Columns({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2,
        overflowX: 'auto',
        pb: 2
      }}
    >
      {children}
    </Box>
  )
}

export function EmptyColumn({ label }: { label: string }): ReactElement {
  return (
    <Typography
      role="status"
      variant="body2"
      color="textSecondary"
      sx={{
        py: 3,
        textAlign: 'center',
        border: '1px dashed',
        borderColor: 'divider',
        borderRadius: 1.5
      }}
    >
      {label}
    </Typography>
  )
}

export function ColumnsSkeleton({ label }: { label: string }): ReactElement {
  return (
    <Box role="progressbar" aria-label={label}>
      <Skeleton variant="text" width={240} height={48} sx={{ mb: 2 }} />
      <Columns>
        {[3, 2, 1].map(cards => (
          <Box
            key={cards}
            sx={{
              flex: '0 0 18rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              p: 1.5,
              borderRadius: 2,
              bgcolor: 'action.hover'
            }}
          >
            <Skeleton variant="text" width="40%" />
            {Array.from({ length: cards }, (_, index) => (
              <Skeleton
                key={index}
                variant="rounded"
                height={88}
                sx={{ bgcolor: 'background.paper' }}
              />
            ))}
          </Box>
        ))}
      </Columns>
    </Box>
  )
}

export interface ColumnProps {
  title: string
  count: number
  actions?: ReactNode
  children: ReactNode
}

export function Column({
  title,
  count,
  actions,
  children,
  ref,
  highlighted = false
}: ColumnProps & {
  ref?: Ref<HTMLElement>
  highlighted?: boolean
}): ReactElement {
  const titleId = useId()
  return (
    <Box
      ref={ref}
      component="section"
      aria-labelledby={titleId}
      sx={theme => ({
        flex: '0 0 18rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        p: 1.5,
        borderRadius: 2,
        bgcolor: highlighted
          ? theme.alpha(theme.vars.palette.primary.main, 0.08)
          : 'action.hover',
        transition: 'background-color 120ms'
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography id={titleId} variant="subtitle1" component="h2">
          {title}
        </Typography>
        <Typography variant="caption" color="textSecondary">
          {count}
        </Typography>
        {actions}
      </Box>
      {children}
    </Box>
  )
}

export const ColumnAddButton = styled(Button)(({ theme }) => ({
  justifyContent: 'flex-start',
  fontSize: theme.typography.body2.fontSize,
  color: theme.vars.palette.text.secondary,
  '&:hover': { color: theme.vars.palette.text.primary }
}))

export const NewColumnButton = styled(ColumnAddButton)(({ theme }) => ({
  flex: '0 0 12rem',
  height: 48,
  border: `1px dashed ${theme.vars.palette.divider}`,
  borderRadius: theme.spacing(1)
}))

export interface CardProps {
  label: string
  menu?: ReactNode
  children: ReactNode
  // Capture phase: the drag sensor owns the card's own onKeyDown.
  onKeyDownCapture?: KeyboardEventHandler<HTMLElement>
}

// The menu shows on hover or focus; touch screens always show it.
export function Card({
  label,
  menu,
  children,
  ref,
  drag = 'none',
  ...rest
}: CardProps &
  HTMLAttributes<HTMLElement> & {
    ref?: Ref<HTMLElement>
    /** `placeholder` is the slot a dragged card leaves, `lifted` the card under the pointer. */
    drag?: 'none' | 'placeholder' | 'lifted'
  }): ReactElement {
  return (
    <Box
      {...rest}
      ref={ref}
      component="article"
      aria-label={label}
      sx={theme => ({
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        p: 1.5,
        borderRadius: 2,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        transition: 'box-shadow 120ms, border-color 120ms',
        '&:hover': { boxShadow: 2, borderColor: 'transparent' },
        '&:focus-visible': {
          outline: `2px solid ${theme.vars.palette.primary.main}`,
          outlineOffset: 2
        },
        ...(drag === 'placeholder' && {
          opacity: 0.4,
          '&:hover': {}
        }),
        ...(drag === 'lifted' && {
          cursor: 'grabbing',
          boxShadow: 8,
          borderColor: 'transparent',
          rotate: '2deg'
        }),
        '& > [data-card-menu]': {
          opacity: 0,
          transition: 'opacity 120ms',
          zIndex: 1
        },
        '&:hover > [data-card-menu], &:focus-within > [data-card-menu], & > [data-card-menu]:has([aria-expanded="true"])':
          { opacity: 1 },
        '@media (hover: none)': { '& > [data-card-menu]': { opacity: 1 } }
      })}
    >
      {menu && (
        <Box
          data-card-menu=""
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            bgcolor: 'background.paper',
            borderRadius: '50%'
          }}
        >
          {menu}
        </Box>
      )}
      {children}
    </Box>
  )
}

export function CardTitle({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box
      sx={{
        fontWeight: 500,
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        '& > *': { fontWeight: 'inherit' },
        // Stretches the title button over the whole card, so a click anywhere on it opens the task.
        '& > button': { position: 'static' },
        '& > button::after': { content: '""', position: 'absolute', inset: 0 }
      }}
    >
      {children}
    </Box>
  )
}

export function Meta({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 0.75
      }}
    >
      {children}
    </Box>
  )
}

type Tone = 'neutral' | 'error' | 'warning' | 'info' | 'success'

// A compact icon and text pill for a card's facts (due date, counts).
export function MetaChip({
  icon,
  tone = 'neutral',
  label,
  children
}: {
  icon: ReactNode
  tone?: Tone
  label: string
  children?: ReactNode
}): ReactElement {
  return (
    <Box
      component="span"
      aria-label={label}
      role="img"
      sx={theme => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        height: 22,
        px: 0.75,
        borderRadius: 1,
        typography: 'caption',
        fontWeight: 500,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        color:
          tone === 'neutral'
            ? theme.vars.palette.text.secondary
            : theme.vars.palette[tone].main,
        bgcolor:
          tone === 'neutral'
            ? 'transparent'
            : theme.alpha(theme.vars.palette[tone].main, 0.12),
        '& svg': { width: 12, height: 12, flexShrink: 0 }
      })}
    >
      {icon}
      {children && <span aria-hidden>{children}</span>}
    </Box>
  )
}

function hueOf(name: string): number {
  let hash = 7
  for (let index = 0; index < name.length; index++) {
    hash = (hash * 31 + name.charCodeAt(index)) % 360
  }
  return hash
}

// Labels have no stored colour, so each name gets a stable hue.
export function LabelChip({
  name,
  highlight = ''
}: {
  name: string
  highlight?: string
}): ReactElement {
  const hue = hueOf(name)
  return (
    <Box
      component="span"
      sx={theme => ({
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        px: 1,
        borderRadius: 10,
        typography: 'caption',
        fontWeight: 500,
        lineHeight: 1,
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: `hsl(${String(hue)} 60% 32%)`,
        bgcolor: `hsl(${String(hue)} 75% 93%)`,
        ...theme.applyStyles('dark', {
          color: `hsl(${String(hue)} 70% 78%)`,
          bgcolor: `hsl(${String(hue)} 40% 24%)`
        })
      })}
    >
      <Highlight text={name} query={highlight} />
    </Box>
  )
}

export function AvatarStack({
  children
}: {
  children: ReactNode
}): ReactElement {
  return (
    <Box
      sx={{
        display: 'flex',
        ml: 'auto',
        '& > *': {
          border: 2,
          borderColor: 'background.paper',
          fontSize: 10,
          letterSpacing: 0
        },
        '& > * + *': { ml: -0.5 }
      }}
    >
      {children}
    </Box>
  )
}

export function Spacer(): ReactElement {
  return <Box sx={{ flex: 1 }} />
}

export function Checklist({
  label,
  children
}: {
  label?: string
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="ul"
      aria-label={label}
      sx={{ listStyle: 'none', m: 0, pl: 1 }}
    >
      {children}
    </Box>
  )
}

export function Row({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{children}</Box>
  )
}
