import { Icon, Right } from '@linagora/twake-icons'
import {
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  styled
} from '@linagora/twake-mui'
import {
  useRef,
  useState,
  type ElementType,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode
} from 'react'

// Time to cross from the entry to the menu it opens without closing it.
const LEAVE_DELAY = 200

/**
 * An entry of a menu that opens another beside it, on its left as a menu at
 * the right of the page leaves room there, as Label as does in Twake Mail.
 * Hovering, a click, Enter or the right arrow opens it; leaving both,
 * Escape or the left arrow closes it.
 */
export function SubMenuItem({
  icon,
  label,
  width,
  children
}: {
  icon: ElementType
  label: string
  /**
   * In px, from the start, for a form it may show to widen it no more, as
   * the name of something new.
   */
  width?: number
  /** The entries of the menu it opens. */
  children: ReactNode
}): ReactElement {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  // Opened by the mouse, it leaves the focus on the menu it is in.
  const [hovered, setHovered] = useState(false)
  const paper = useRef<HTMLDivElement | null>(null)
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stay = () => {
    if (leaving.current !== null) clearTimeout(leaving.current)
    leaving.current = null
  }
  const close = () => {
    stay()
    setAnchor(null)
  }
  const leave = () => {
    stay()
    leaving.current = setTimeout(() => {
      // Typing in it, it stays open wherever the mouse goes.
      if (!paper.current?.contains(document.activeElement)) close()
    }, LEAVE_DELAY)
  }
  const open = (element: HTMLElement, byMouse: boolean) => {
    stay()
    setHovered(byMouse)
    setAnchor(element)
  }

  return (
    <>
      <MenuItem
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onMouseEnter={event => {
          open(event.currentTarget, true)
        }}
        onMouseLeave={leave}
        onClick={event => {
          open(event.currentTarget, false)
        }}
        onKeyDown={event => {
          if (event.key !== 'ArrowRight') return
          event.preventDefault()
          open(event.currentTarget, false)
        }}
      >
        <ListItemIcon>
          <Icon icon={icon} />
        </ListItemIcon>
        <ListItemText>{label}</ListItemText>
        <Icon icon={Right} size={12} />
      </MenuItem>
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={close}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        // The menu it is in stays under the pointer, to hover its entries.
        hideBackdrop
        autoFocus={!hovered}
        disableAutoFocus={hovered}
        disableEnforceFocus
        disableRestoreFocus={hovered}
        slotProps={{
          root: { sx: { pointerEvents: 'none' } },
          paper: {
            ref: paper,
            sx: { pointerEvents: 'auto', width },
            onMouseEnter: stay,
            onMouseLeave: leave
          },
          list: {
            'aria-label': label,
            // A pick closes it, with the menu it is in.
            onClick: close,
            onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
              if (event.key !== 'ArrowLeft') return
              event.preventDefault()
              close()
            }
          }
        }}
      >
        {children}
      </Menu>
    </>
  )
}

/** The icon of an entry, kept in its place while hidden for the names to align. */
export const SubMenuIcon = styled(ListItemIcon, {
  shouldForwardProp: prop => prop !== 'hidden'
})<{ hidden?: boolean }>(({ hidden }) => ({
  visibility: hidden ? 'hidden' : 'visible'
}))

/** A form in a menu, such as the name of something new it adds. */
export const SubMenuForm = styled('li')(({ theme }) => ({
  padding: theme.spacing(1, 2),
  '& .MuiButton-root': { marginTop: theme.spacing(1) },
  '& .MuiButton-root + .MuiButton-root': { marginLeft: theme.spacing(1) }
}))
