import { Burger } from '@linagora/twake-icons'
import {
  createTheme,
  Drawer,
  Fab,
  IconButton,
  ThemeProvider,
  useMediaQuery,
  useTheme,
  type Theme
} from '@linagora/twake-mui'
import { createContext, use, type ReactElement, type ReactNode } from 'react'

import { Icon } from '@/ds/Icon'
import { SELECTION_BAR } from '@/ds/SelectionBar'
import { PHONE_BOTTOM } from '@/ds/Toast'

// Below lg, the width the sidebar becomes a menu drawer under, as Twake Space.
export function useNarrowScreen(): boolean {
  return useMediaQuery(useTheme().breakpoints.down('lg'), { noSsr: true })
}

// twake-mui turns its sidebar and nav items into a bottom bar below lg. In the
// menu drawer they keep their wide screen look: lg starts at 0 there.
function wideScreen(theme: Theme): Theme {
  return {
    ...theme,
    breakpoints: createTheme({
      breakpoints: { values: { ...theme.breakpoints.values, lg: 0 } }
    }).breakpoints
  }
}

export interface MenuControl {
  label: string
  open: boolean
  setOpen: (open: boolean) => void
}

export const MenuContext = createContext<MenuControl | null>(null)

export function MenuButton(): ReactElement | null {
  const menu = use(MenuContext)
  const narrow = useNarrowScreen()
  if (!menu || !narrow) return null
  return (
    <IconButton
      aria-label={menu.label}
      aria-haspopup="dialog"
      aria-expanded={menu.open}
      onClick={() => {
        menu.setOpen(true)
      }}
      sx={{
        flex: 'none',
        width: 44,
        height: 44,
        color: 'text.secondary',
        bgcolor: 'action.hover'
      }}
    >
      <Icon icon={Burger} size={20} />
    </IconButton>
  )
}

export function MenuDrawer({
  menu,
  children
}: {
  menu: MenuControl
  children: ReactNode
}): ReactElement {
  return (
    <Drawer
      anchor="left"
      open={menu.open}
      onClose={() => {
        menu.setOpen(false)
      }}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-label': menu.label,
          'aria-modal': true,
          sx: {
            width: 332,
            maxWidth: 'calc(100% - 56px)',
            pb: PHONE_BOTTOM,
            bgcolor: 'background.default'
          }
        }
      }}
    >
      <ThemeProvider theme={wideScreen}>{children}</ThemeProvider>
    </Drawer>
  )
}

/**
 * The page's main action below lg, as Twake Space's. In the stacking order of
 * the page, so that an open task covers it; the selection bar takes its place.
 */
export function PhoneFab({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: ReactNode
}): ReactElement {
  return (
    <Fab
      color="primary"
      aria-label={label}
      onClick={onClick}
      sx={{
        position: 'absolute',
        zIndex: 'auto',
        right: 16,
        bottom: `calc(${PHONE_BOTTOM} + 16px)`,
        [`#content:has([${SELECTION_BAR}]) &`]: { display: 'none' }
      }}
    >
      {children}
    </Fab>
  )
}
