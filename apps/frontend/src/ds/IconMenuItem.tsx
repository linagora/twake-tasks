import { Icon } from '@linagora/twake-icons'
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
}: MenuItemProps & { icon: ElementType }): ReactElement {
  return (
    <MenuItem {...props}>
      <ListItemIcon>
        <Icon icon={icon} />
      </ListItemIcon>
      <ListItemText>{children}</ListItemText>
    </MenuItem>
  )
}
