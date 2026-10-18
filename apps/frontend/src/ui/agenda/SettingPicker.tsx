import { Check, Icon } from '@linagora/twake-icons'
import {
  DropdownButton,
  ListItem,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem
} from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import type { IconComponent } from '@/ds/viewIcons'
import { useI18n } from '@/ui/i18n/useI18n'

export interface SettingChoice<T extends string> {
  value: T
  name: string
  icon: IconComponent
}

/**
 * A row of a view's settings that picks one of a few choices, as its layout
 * or grouping: the choice's icon and the setting's name, then a Twake
 * dropdown whose menu checks the choice.
 */
export function SettingPicker<T extends string>({
  label,
  value,
  choices,
  iconInButton = false,
  onChange
}: {
  label: string
  value: T
  choices: readonly SettingChoice<T>[]
  /** The dropdown shows the choice's icon before its name too. */
  iconInButton?: boolean
  onChange: (value: T) => void
}): ReactElement {
  const { t } = useI18n()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const close = () => {
    setAnchor(null)
  }
  const chosen = choices.find(each => each.value === value)

  return (
    <ListItem disableGutters ellipsis={false}>
      <ListItemIcon>{chosen && <Icon icon={chosen.icon} />}</ListItemIcon>
      <ListItemText primary={label} />
      <DropdownButton
        textVariant="body2"
        aria-label={t('filters.criterion', {
          name: label,
          value: chosen?.name ?? ''
        })}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={event => {
          setAnchor(event.currentTarget)
        }}
      >
        {iconInButton && chosen && (
          <Icon icon={chosen.icon} size={16} className="u-mr-half" />
        )}
        {chosen?.name}
      </DropdownButton>
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ list: { 'aria-label': label } }}
      >
        {choices.map(each => (
          <MenuItem
            key={each.value}
            role="menuitemradio"
            aria-checked={each.value === value}
            selected={each.value === value}
            onClick={() => {
              close()
              if (each.value !== value) onChange(each.value)
            }}
          >
            <ListItemIcon>
              <Icon icon={each.icon} />
            </ListItemIcon>
            <ListItemText primary={each.name} />
            <ListItemIcon>
              {each.value === value && <Icon icon={Check} />}
            </ListItemIcon>
          </MenuItem>
        ))}
      </Menu>
    </ListItem>
  )
}
