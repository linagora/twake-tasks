import { Icon, type IconProps } from '@linagora/twake-icons'
import { alpha, Box, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

export function CardTile({
  label,
  icon,
  iconLabel,
  title,
  tag,
  meta,
  action
}: {
  label: string
  icon: IconProps['icon']
  iconLabel: string
  title: ReactNode
  tag: string
  meta: string
  action?: ReactNode
}): ReactElement {
  return (
    <Box
      component="li"
      aria-label={label}
      sx={theme => ({
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        p: 2,
        borderRadius: 3,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        transition: theme.transitions.create(['border-color', 'box-shadow']),
        '&:hover, &:focus-within': {
          borderColor: 'primary.main',
          boxShadow: theme.shadows[2]
        },
        '& a': { color: 'text.primary', textDecoration: 'none' },
        '& a::after': { content: '""', position: 'absolute', inset: 0 },
        '& a:focus-visible': { outline: 'none' }
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 36 }}>
        <Box
          role="img"
          aria-label={iconLabel}
          sx={theme => ({
            width: 36,
            height: 36,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'primary.main',
            bgcolor: alpha(theme.palette.primary.main, 0.1)
          })}
        >
          <Icon icon={icon} size={18} />
        </Box>
        {action && (
          <Box sx={{ ml: 'auto', position: 'relative', zIndex: 1 }}>
            {action}
          </Box>
        )}
      </Box>
      <Typography
        variant="subtitle1"
        component="h2"
        noWrap
        sx={{ fontWeight: 600 }}
      >
        {title}
      </Typography>
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
        <Typography variant="caption" color="textSecondary">
          {meta}
        </Typography>
      </Box>
    </Box>
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
