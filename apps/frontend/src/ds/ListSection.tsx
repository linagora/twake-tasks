import { Box, List, Typography } from '@linagora/twake-mui'
import { useId, type ReactElement, type ReactNode } from 'react'

/**
 * A titled part of a page as a Twake list: its title in plain words above
 * it, with an action at its end, as a plus to add a row.
 */
export function ListSection({
  title,
  action,
  children
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}): ReactElement {
  const titleId = useId()
  return (
    <Box component="section">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography id={titleId} variant="h4" component="h2">
          {title}
        </Typography>
        {action}
      </Box>
      <List aria-labelledby={titleId} disablePadding>
        {children}
      </List>
    </Box>
  )
}

/** The chosen values of a row of a list, wrapping under its name. */
export function RowValues({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box
      component="span"
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 0.5,
        mt: 0.5
      }}
    >
      {children}
    </Box>
  )
}
