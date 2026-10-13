import { ListItemText, MenuItem } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

// A disabled item, so keyboard focus skips it, drawn at full contrast and
// wrapped so a whole sentence reads.
export function MenuHint({ children }: { children: string }): ReactElement {
  return (
    <MenuItem
      disabled
      sx={{
        whiteSpace: 'normal',
        maxWidth: 280,
        '&.Mui-disabled': { opacity: 1 }
      }}
    >
      <ListItemText
        primary={children}
        slotProps={{ primary: { variant: 'body2', color: 'textSecondary' } }}
      />
    </MenuItem>
  )
}
