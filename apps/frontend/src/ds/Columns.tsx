import { Box, Typography } from '@linagora/twake-mui'
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
  children
}: {
  title: string
  count: number
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
      </Box>
      {children}
    </Box>
  )
}

export function Card({
  label,
  children
}: {
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <Box
      component="article"
      aria-label={label}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        p: 1.5,
        borderRadius: 2,
        bgcolor: 'background.paper',
        boxShadow: 1
      }}
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
