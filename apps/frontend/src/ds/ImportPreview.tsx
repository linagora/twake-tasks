import { Box, Stack, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

export function FieldGrid({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        gap: 2
      }}
    >
      {children}
    </Box>
  )
}

export function PreviewList({
  label,
  children
}: {
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <Stack
      component="ul"
      aria-label={label}
      spacing={1}
      sx={{ p: 0, m: 0, listStyle: 'none' }}
    >
      {children}
    </Stack>
  )
}

/** A task as it will be created, on one card. */
export function PreviewItem({
  title,
  meta
}: {
  title: string
  meta: string
}): ReactElement {
  return (
    <Box
      component="li"
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: '10px',
        bgcolor: 'background.paper',
        px: 1.5,
        py: 1
      }}
    >
      <Typography variant="body2" noWrap>
        {title}
      </Typography>
      {meta !== '' && (
        <Typography
          variant="caption"
          color="textSecondary"
          component="p"
          noWrap
        >
          {meta}
        </Typography>
      )}
    </Box>
  )
}
