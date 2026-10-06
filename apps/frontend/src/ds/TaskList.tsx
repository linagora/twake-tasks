import { alpha, Box, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

export function TaskGroup({
  label,
  count,
  tone = 'default',
  children
}: {
  label: string
  count: number
  tone?: 'default' | 'error' | undefined
  children: ReactNode
}): ReactElement {
  return (
    <Box component="section" aria-label={label} sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
        <Typography
          variant="subtitle1"
          component="h2"
          sx={{
            fontWeight: 600,
            color: tone === 'error' ? 'error.main' : 'text.primary'
          }}
        >
          {label}
        </Typography>
        <Typography variant="caption" color="textSecondary">
          {count}
        </Typography>
      </Box>
      <Box
        component="ul"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden'
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

export function TaskRow({
  label,
  title,
  context,
  excerpt,
  facts,
  check,
  leading,
  trailing,
  unread = false
}: {
  label: string
  title: ReactNode
  context: string
  excerpt?: ReactNode
  facts?: ReactNode
  check?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  unread?: boolean
}): ReactElement {
  return (
    <Box
      component="li"
      aria-label={label}
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: check ? 1 : 2,
        minHeight: 56,
        pl: check ? 1 : 2,
        pr: 2,
        py: 1,
        bgcolor: 'background.paper',
        '& + &': { borderTop: 1, borderColor: 'divider' },
        '&:hover, &:focus-within': { bgcolor: 'action.hover' },
        '& a': { color: 'text.primary', textDecoration: 'none' },
        '& a::after': { content: '""', position: 'absolute', inset: 0 },
        '& button': { position: 'relative', zIndex: 1 },
        '& a:focus-visible': { outline: 'none' }
      }}
    >
      {check && (
        <Box sx={{ position: 'relative', zIndex: 1, flexShrink: 0 }}>
          {check}
        </Box>
      )}
      {leading && (
        <Box
          aria-hidden
          sx={theme => ({
            display: 'grid',
            placeItems: 'center',
            width: 32,
            height: 32,
            flexShrink: 0,
            borderRadius: '50%',
            color: unread ? 'primary.main' : 'text.secondary',
            bgcolor: unread
              ? alpha(theme.palette.primary.main, 0.12)
              : 'action.hover'
          })}
        >
          {leading}
        </Box>
      )}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 2,
          rowGap: 0.5
        }}
      >
        <Box sx={{ flex: '1 1 14rem', minWidth: 0 }}>
          <Typography
            variant="body1"
            noWrap
            sx={{ fontWeight: unread ? 600 : undefined }}
          >
            {title}
          </Typography>
          {excerpt && (
            <Typography variant="body2" color="textSecondary" noWrap>
              {excerpt}
            </Typography>
          )}
          <Typography
            variant="caption"
            component="p"
            color="textSecondary"
            noWrap
          >
            {context}
          </Typography>
        </Box>
        {facts && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 1,
              minWidth: 0
            }}
          >
            {facts}
          </Box>
        )}
      </Box>
      {trailing}
    </Box>
  )
}
