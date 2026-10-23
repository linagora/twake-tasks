import { ListItemText, MenuItem, type MenuItemProps } from '@linagora/twake-mui'
import { useId, type ReactElement, type ReactNode } from 'react'

// Named by the label alone, so a screen reader reads the hint as the item's
// description rather than as part of its name. The other props reach the
// MenuItem: MenuList clones its items to give one autoFocus and tabIndex.
export function MenuOption({
  label,
  hint,
  icon,
  ...item
}: Omit<MenuItemProps, 'children'> & {
  label: string
  hint: string
  icon?: ReactNode
}): ReactElement {
  const id = useId()

  return (
    <MenuItem {...item} aria-labelledby={id} aria-describedby={`${id}-hint`}>
      {icon}
      <ListItemText
        primary={label}
        secondary={hint}
        sx={{ whiteSpace: 'normal', maxWidth: 280 }}
        slotProps={{
          primary: { id },
          secondary: { id: `${id}-hint` }
        }}
      />
    </MenuItem>
  )
}
