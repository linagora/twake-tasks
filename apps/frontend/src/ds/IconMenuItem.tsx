import { Dots, Icon } from '@linagora/twake-icons'
import {
  ListItemIcon,
  ListItemText,
  MenuItem,
  type MenuItemProps
} from '@linagora/twake-mui'
import type { ElementType, ReactElement } from 'react'

export function IconMenuItem({
  icon,
  children,
  ...props
}: MenuItemProps & { icon?: ElementType | undefined }): ReactElement {
  return (
    <MenuItem {...props}>
      {/* twake-mui gives ListItemIcon no min width, so an item without an
          icon keeps a hidden one to stay aligned with its neighbours. */}
      <ListItemIcon sx={icon ? undefined : { visibility: 'hidden' }}>
        <Icon icon={icon ?? Dots} />
      </ListItemIcon>
      <ListItemText>{children}</ListItemText>
    </MenuItem>
  )
}
