import { Box, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

export function Stack({
  label,
  children
}: {
  label?: string
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component={label ? 'ul' : 'div'}
      aria-label={label}
      sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1 }}
    >
      {children}
    </Box>
  )
}

export function MonthGrid({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gap: 1,
        mb: 2
      }}
    >
      {children}
    </Box>
  )
}

export function DayCell({
  label,
  number,
  outside,
  children
}: {
  label: string
  number: number
  outside: boolean
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="section"
      aria-label={label}
      sx={{
        minHeight: '6rem',
        p: 0.5,
        borderRadius: 1,
        bgcolor: 'action.hover',
        opacity: outside ? 0.5 : 1,
        display: 'grid',
        alignContent: 'start',
        gap: 0.5
      }}
    >
      <Typography variant="caption" color="textSecondary">
        {number}
      </Typography>
      {children}
    </Box>
  )
}
