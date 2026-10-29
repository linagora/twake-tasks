import {
  Box,
  ListItem,
  ListItemAvatar,
  ListItemText
} from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

export interface PersonSuggestion {
  key: string
  /** What picking the person puts in the field. */
  value: string
  label: string
  detail?: string | undefined
  avatar: ReactNode
}

export function PersonRow({
  label,
  detail,
  avatar,
  children
}: {
  label: string
  detail?: string | undefined
  avatar: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <ListItem aria-label={label} gutters="disabled">
      <ListItemAvatar sx={{ minWidth: 44 }}>{avatar}</ListItemAvatar>
      <ListItemText
        primary={label}
        secondary={detail}
        slotProps={{
          primary: { noWrap: true },
          secondary: { noWrap: true }
        }}
      />
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}
      >
        {children}
      </Box>
    </ListItem>
  )
}
