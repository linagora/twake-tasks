import {
  Bell,
  Calendar,
  CalendarToday,
  Filter,
  Home,
  Icon,
  Logout,
  Plus,
  Profile,
  Star
} from '@linagora/twake-icons'
import {
  Button,
  Divider,
  IconButton,
  Link,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Nav,
  NavIcon,
  NavItem,
  NavText,
  useMediaQuery,
  useTheme
} from '@linagora/twake-mui'
import {
  useRef,
  useState,
  type ElementType,
  type ReactElement,
  type RefObject
} from 'react'
import { Outlet, Link as RouterLink, useLocation } from 'react-router'

import {
  AccountCard,
  AppFrame,
  BrandMark,
  CountBadge,
  SidebarSection,
  TopBar,
  TopBarSearch,
  TopBarSpacer,
  WideScreenNavItem
} from '@/ds/AppFrame'
import { displayName } from '@/domain/person'
import { SearchField } from '@/ui/agenda/SearchScreen'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { useBoards, useUnreadNotifications } from '@/ui/boards/queries'
import { PlatformBar } from '@/ui/shell/PlatformBar'
import { QuickAdd } from '@/ui/shell/QuickAdd'
import { SidebarLink } from '@/ui/shell/SidebarLink'
import { ShortcutsHelp, useShortcuts } from '@/ui/shell/Shortcuts'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'
import { useSettings } from '@/ui/settings/useSettings'

export function AppShell(): ReactElement {
  const [quickAdd, setQuickAdd] = useState(false)
  const [help, setHelp] = useState(false)
  const search = useRef<HTMLInputElement>(null)
  useShortcuts({
    quickAdd: () => {
      setQuickAdd(true)
    },
    search: () => {
      search.current?.focus()
    },
    help: () => {
      setHelp(true)
    }
  })

  return (
    <AppFrame
      topBar={
        <Header
          searchRef={search}
          onQuickAdd={() => {
            setQuickAdd(true)
          }}
        />
      }
      sidebar={
        <>
          <AppNav />
          <Favorites />
        </>
      }
    >
      <Outlet />
      {quickAdd && (
        <QuickAdd
          onClose={() => {
            setQuickAdd(false)
          }}
        />
      )}
      {help && (
        <ShortcutsHelp
          onClose={() => {
            setHelp(false)
          }}
        />
      )}
    </AppFrame>
  )
}

function Header({
  searchRef,
  onQuickAdd
}: {
  searchRef: RefObject<HTMLInputElement | null>
  onQuickAdd: () => void
}): ReactElement {
  const { t } = useI18n()
  const { sdk } = useSession()
  const theme = useTheme()
  const compact = useMediaQuery(theme.breakpoints.down('md'))
  const phone = useMediaQuery(theme.breakpoints.down('lg'))

  const search = (
    <TopBarSearch>
      <SearchField inputRef={searchRef} />
    </TopBarSearch>
  )
  const quickAdd = compact ? (
    <IconButton
      color="primary"
      aria-label={t('quickAdd.title')}
      onClick={onQuickAdd}
    >
      <Icon icon={Plus} />
    </IconButton>
  ) : (
    <Button startIcon={<Icon icon={Plus} />} onClick={onQuickAdd}>
      {t('quickAdd.title')}
    </Button>
  )

  // The platform bar holds the account; the phone bottom bar has no room for
  // the filters, which the account menu offered.
  if (sdk) {
    return (
      <PlatformBar
        sdk={sdk}
        slots={{
          search: <div className="u-mh-1">{search}</div>,
          right: (
            <>
              {phone && (
                <IconButton
                  component={RouterLink}
                  to="/filters"
                  aria-label={t('filters.title')}
                >
                  <Icon icon={Filter} />
                </IconButton>
              )}
              {quickAdd}
            </>
          )
        }}
      />
    )
  }

  return (
    <TopBar>
      <Link
        component={RouterLink}
        to="/"
        underline="none"
        aria-label={t('app.name')}
      >
        <BrandMark name={t('app.name')} />
      </Link>
      {search}
      <TopBarSpacer />
      {quickAdd}
      <AccountMenu />
    </TopBar>
  )
}

function AccountMenu(): ReactElement {
  const { t } = useI18n()
  const { user, signOut } = useSession()
  const { data: settings } = useSettings()
  const email = user.email ?? ''
  const name = displayName({ email, name: settings?.name ?? user.name ?? null })
  const theme = useTheme()
  // The menu focuses its first item on open, so an item hidden with CSS
  // would keep the focus, and Escape, outside the menu.
  const phone = useMediaQuery(theme.breakpoints.down('lg'))
  const { pathname } = useLocation()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [openedOn, setOpenedOn] = useState(pathname)
  if (anchor !== null && openedOn !== pathname) setAnchor(null)
  const close = (): void => {
    setAnchor(null)
  }
  const avatar = (size: 's' | 'l'): ReactElement => (
    <PersonAvatar
      email={email}
      name={name}
      avatar={settings?.avatar}
      size={size}
    />
  )

  return (
    <>
      <IconButton
        aria-label={name}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={event => {
          setAnchor(event.currentTarget)
          setOpenedOn(pathname)
        }}
      >
        {avatar('s')}
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <AccountCard
          avatar={avatar('l')}
          name={name}
          email={email === name ? undefined : email}
        />
        <Divider />
        {phone && (
          <MenuItem component={RouterLink} to="/filters" onClick={close}>
            <ListItemIcon>
              <Icon icon={Filter} />
            </ListItemIcon>
            <ListItemText>{t('filters.title')}</ListItemText>
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            close()
            void signOut()
          }}
        >
          <ListItemIcon>
            <Icon icon={Logout} />
          </ListItemIcon>
          <ListItemText>{t('session.signOut')}</ListItemText>
        </MenuItem>
      </Menu>
    </>
  )
}

function AppNav(): ReactElement {
  const { t } = useI18n()
  const unread = useUnreadNotifications().data ?? 0

  return (
    <Nav>
      <AppNavLink to="/" end icon={Home} label={t('boards.title')} />
      <AppNavLink to="/today" icon={CalendarToday} label={t('agenda.today')} />
      <AppNavLink to="/upcoming" icon={Calendar} label={t('agenda.upcoming')} />
      <AppNavLink to="/mine" icon={Profile} label={t('agenda.mine')} />
      <AppNavLink
        to="/notifications"
        icon={Bell}
        label={t('notifications.title')}
        count={unread}
        countLabel={t('notifications.unread', { count: unread })}
      />
      <AppNavLink
        to="/filters"
        icon={Filter}
        label={t('filters.title')}
        wideScreenOnly
      />
    </Nav>
  )
}

function AppNavLink({
  to,
  end = false,
  icon,
  label,
  count = 0,
  countLabel,
  wideScreenOnly = false
}: {
  to: string
  end?: boolean
  icon: ElementType
  label: string
  count?: number
  countLabel?: string
  wideScreenOnly?: boolean
}): ReactElement {
  const Item = wideScreenOnly ? WideScreenNavItem : NavItem
  return (
    <Item>
      <SidebarLink to={to} end={end} label={count > 0 ? countLabel : undefined}>
        <CountBadge count={count}>
          <NavIcon icon={icon} />
        </CountBadge>
        <NavText>{label}</NavText>
      </SidebarLink>
    </Item>
  )
}

function Favorites(): ReactElement | null {
  const { t } = useI18n()
  const favorites = (useBoards().data ?? []).filter(
    board => board.favorite && !board.archived
  )
  if (favorites.length === 0) return null

  return (
    <SidebarSection label={t('boards.favorites')}>
      {favorites.map(board => (
        <NavItem key={board.id}>
          <SidebarLink to={`/boards/${board.id}`}>
            <NavIcon icon={Star} />
            <NavText>{board.name}</NavText>
          </SidebarLink>
        </NavItem>
      ))}
    </SidebarSection>
  )
}
