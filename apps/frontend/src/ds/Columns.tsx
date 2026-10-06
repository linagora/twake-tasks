import { alpha, Box, Button, styled, Typography } from '@linagora/twake-mui'
import { useId, type ReactElement, type ReactNode } from 'react'

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

export function Column({
  title,
  count,
  actions,
  children
}: {
  title: string
  count: number
  actions?: ReactNode
  children: ReactNode
}): ReactElement {
  const titleId = useId()
  return (
    <Box
      component="section"
      aria-labelledby={titleId}
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
  color: theme.palette.text.secondary,
  '&:hover': { color: theme.palette.text.primary }
}))

export const NewColumnButton = styled(ColumnAddButton)(({ theme }) => ({
  flex: '0 0 18rem',
  height: 48,
  border: `1px dashed ${theme.palette.divider}`,
  borderRadius: theme.spacing(1)
}))

// The menu shows on hover or focus; touch screens always show it.
export function Card({
  label,
  menu,
  children
}: {
  label: string
  menu?: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="article"
      aria-label={label}
      sx={{
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
        '& > [data-card-menu]': { opacity: 0, transition: 'opacity 120ms' },
        '&:hover > [data-card-menu], &:focus-within > [data-card-menu], & > [data-card-menu]:has([aria-expanded="true"])':
          { opacity: 1 },
        '@media (hover: none)': { '& > [data-card-menu]': { opacity: 1 } }
      }}
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
        '& > *': { fontWeight: 'inherit' }
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
            ? theme.palette.text.secondary
            : theme.palette[tone].main,
        bgcolor:
          tone === 'neutral'
            ? 'transparent'
            : alpha(theme.palette[tone].main, 0.12),
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
export function LabelChip({ name }: { name: string }): ReactElement {
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
        color:
          theme.palette.mode === 'dark'
            ? `hsl(${String(hue)} 70% 78%)`
            : `hsl(${String(hue)} 60% 32%)`,
        bgcolor:
          theme.palette.mode === 'dark'
            ? `hsl(${String(hue)} 40% 24%)`
            : `hsl(${String(hue)} 75% 93%)`
      })}
    >
      {name}
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
        '& > *': { border: 2, borderColor: 'background.paper' },
        '& > * + *': { ml: -0.75 }
      }}
    >
      {children}
    </Box>
  )
}

export function Spacer(): ReactElement {
  return <Box sx={{ flex: 1 }} />
}

export function Checklist({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, pl: 1 }}>
      {children}
    </Box>
  )
}

export function Row({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{children}</Box>
  )
}
