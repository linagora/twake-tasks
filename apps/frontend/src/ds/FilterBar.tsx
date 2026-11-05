import {
  Bottom,
  Check,
  CrossSmall,
  Filter,
  Magnifier
} from '@linagora/twake-icons'
import {
  Box,
  Chip,
  InputAdornment,
  MenuItem,
  TextField,
  type Theme
} from '@linagora/twake-mui'
import { useState, type ReactElement, type ReactNode, type Ref } from 'react'

import { Icon } from '@/ds/Icon'
import { Menu } from '@/ds/Menu'
import { PhoneIconButton } from '@/ds/PageHeader'

const tinted = (theme: Theme) => ({
  bgcolor: theme.alpha(theme.vars.palette.primary.main, 0.08)
})

/** Tinted while a filter narrows the page. Its icon alone on a phone. */
export function FilterButton({
  active,
  expanded,
  shortcut,
  disabled,
  onClick,
  children
}: {
  active: boolean
  expanded: boolean
  shortcut?: string | undefined
  disabled?: boolean
  onClick: () => void
  children: string
}): ReactElement {
  return (
    <PhoneIconButton
      startIcon={<Icon icon={Filter} />}
      aria-expanded={expanded}
      aria-keyshortcuts={shortcut}
      disabled={disabled}
      onClick={onClick}
      sx={active ? tinted : undefined}
    >
      {children}
    </PhoneIconButton>
  )
}

/** Escape inside it, though not in one of its menus, calls `onEscape`. */
export function FilterBar({
  label,
  onEscape,
  children,
  actions,
  role = 'search'
}: {
  label: string
  onEscape: () => void
  children: ReactNode
  actions?: ReactNode
  /** A group narrows results a search already found. */
  role?: 'search' | 'group'
}): ReactElement {
  return (
    <Box
      role={role}
      aria-label={label}
      onKeyDown={event => {
        // A menu is portalled: its Escape bubbles here from outside the bar.
        if (
          event.key === 'Escape' &&
          event.currentTarget.contains(event.target as Node)
        )
          onEscape()
      }}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1,
        mb: 2
      }}
    >
      {children}
      <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>{actions}</Box>
    </Box>
  )
}

export function FilterField({
  label,
  value,
  onChange,
  inputRef
}: {
  label: string
  value: string
  onChange: (value: string) => void
  inputRef?: Ref<HTMLInputElement> | undefined
}): ReactElement {
  return (
    <TextField
      size="small"
      placeholder={label}
      value={value}
      inputRef={inputRef}
      onChange={event => {
        onChange(event.target.value)
      }}
      // The height of the chips beside it.
      sx={{
        flex: { xs: '1 1 100%', sm: '0 1 16rem' },
        '& .MuiInputBase-root': { height: 32 }
      }}
      slotProps={{
        htmlInput: { 'aria-label': label },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Icon icon={Magnifier} size={16} />
            </InputAdornment>
          )
        }
      }}
    />
  )
}

export interface FilterOption<T> {
  value: T
  name: string
  start?: ReactNode
  /** Shown in the menu instead of the name. */
  item?: ReactNode
}

/**
 * A criterion: its chip reads `shown` once something is picked, and opens a
 * menu that stays open to pick several values, or closes on the one value of a
 * `single` criterion.
 */
export function FilterChip<T extends string | number>({
  name,
  shown,
  removeLabel,
  options,
  value,
  onChange,
  single = false
}: {
  name: string
  shown: string
  removeLabel: string
  options: FilterOption<T>[]
  value: T[]
  onChange: (value: T[]) => void
  single?: boolean
}): ReactElement {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const active = value.length > 0
  const toggle = (each: T) => {
    if (single) {
      setAnchor(null)
      onChange(value.includes(each) ? [] : [each])
      return
    }
    const known = options.map(option => option.value)
    // In the options' order, so that the result does not depend on the clicks.
    // A value with no option, as a link's former member, stays picked.
    onChange([
      ...known.filter(option =>
        option === each ? !value.includes(each) : value.includes(option)
      ),
      ...value.filter(option => !known.includes(option))
    ])
  }
  return (
    <>
      <Chip
        variant="outlined"
        color={active ? 'primary' : 'default'}
        label={
          active ? (
            shown
          ) : (
            <Box
              component="span"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              {name}
              <Icon icon={Bottom} size={12} />
            </Box>
          )
        }
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={event => {
          setAnchor(event.currentTarget)
        }}
        {...(active && {
          onDelete: () => {
            onChange([])
          },
          deleteIcon: (
            <Icon
              icon={CrossSmall}
              aria-hidden={false}
              aria-label={removeLabel}
            />
          )
        })}
        sx={theme => ({ maxWidth: '20rem', ...(active && tinted(theme)) })}
      />
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => {
          setAnchor(null)
        }}
        slotProps={{ list: { 'aria-label': name } }}
      >
        {options.map(option => (
          <MenuItem
            key={option.value}
            role={single ? 'menuitemradio' : 'menuitemcheckbox'}
            aria-checked={value.includes(option.value)}
            onClick={() => {
              toggle(option.value)
            }}
            sx={{ gap: 1.5, minWidth: 200 }}
          >
            {option.start}
            <Box sx={{ flex: 1, minWidth: 0 }} className="u-ellipsis">
              {option.item ?? option.name}
            </Box>
            <Box
              component="span"
              sx={{ display: 'flex', color: 'primary.main', width: 16 }}
            >
              {value.includes(option.value) && <Icon icon={Check} size={16} />}
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
