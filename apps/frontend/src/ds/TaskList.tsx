import { Box, Typography } from '@linagora/twake-mui'
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
  facts
}: {
  label: string
  title: ReactNode
  context: string
  facts: ReactNode
}): ReactElement {
  return (
    <Box
      component="li"
      aria-label={label}
      sx={{
        position: 'relative',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 2,
        rowGap: 0.5,
        minHeight: 56,
        px: 2,
        py: 1,
        bgcolor: 'background.paper',
        '& + &': { borderTop: 1, borderColor: 'divider' },
        '&:hover, &:focus-within': { bgcolor: 'action.hover' },
        '& a': { color: 'text.primary', textDecoration: 'none' },
        '& a::after': { content: '""', position: 'absolute', inset: 0 },
        '& a:focus-visible': { outline: 'none' }
      }}
    >
      <Box sx={{ flex: '1 1 16rem', minWidth: 0 }}>
        <Typography variant="body1" noWrap>
          {title}
        </Typography>
        <Typography
          variant="caption"
          component="p"
          color="textSecondary"
          noWrap
        >
          {context}
        </Typography>
      </Box>
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}
      >
        {facts}
      </Box>
    </Box>
  )
}
