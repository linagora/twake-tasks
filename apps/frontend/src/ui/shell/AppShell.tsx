import {
  Archive,
  Bell,
  Bottom,
  Calendar,
  CalendarToday,
  Filter,
  Icon,
  Logout,
  Mosaic,
  Plus,
  Profile,
  Right,
  Star
} from '@linagora/twake-icons'
import {
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
  Tooltip,
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
import {
  Outlet,
  Link as RouterLink,
  useLocation,
  useMatch,
  useNavigate
} from 'react-router'

import {
  AccountCard,
  AppFrame,
  BarNavItem,
  BrandMark,
  CountBadge,
  OneLineNavText,
  SidebarButton,
  SidebarSection,
  SidebarShelves,
  TopBar,
  TopBarSearch,
  TopBarSpacer,
  WideScreenAction,
  WideScreenNavItem
} from '@/ds/AppFrame'
import { HomeIcon } from '@/ds/HomeIcon'
import { displayName } from '@/domain/person'
import { SearchField } from '@/ui/agenda/SearchScreen'
import { NewBoardDialog } from '@/ui/boards/NewBoardDialog'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { useBoards, useUnreadNotifications } from '@/ui/boards/queries'
import { AppFeedback } from '@/ui/shell/AppFeedback'
import { PlatformBar } from '@/ui/shell/PlatformBar'
import { NewTaskFromUrl } from '@/ui/shell/NewTaskDialog'
import { NewTaskHighlightProvider } from '@/ui/shell/NewTaskHighlight'
import { SidebarLink } from '@/ui/shell/SidebarLink'
import { ShortcutsHelp, useShortcuts } from '@/ui/shell/Shortcuts'
import { useNewTaskParam } from '@/ui/shell/useNewTaskParam'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'
import { useSettings } from '@/ui/settings/useSettings'

export function AppShell(): ReactElement {
  const { openNewTask } = useNewTaskParam()
  const startNewTask = (): void => {
    openNewTask()
  }
  const [help, setHelp] = useState(false)
  const search = useRef<HTMLInputElement>(null)
  const { t } = useI18n()
  const lit = useLitEntry()
  // A new task goes in the board it is created from, else in the Inbox.
  const inBoardId = useMatch('/boards/:boardId/*')?.params.boardId
  useShortcuts({
    newTask: startNewTask,
    search: () => {
      search.current?.focus()
    },
    help: () => {
      setHelp(true)
    }
  })

  return (
    <AppFrame
      topBar={<Header searchRef={search} onNewTask={startNewTask} />}
      sidebar={
        <>
          <SidebarButton
            startIcon={<Icon icon={Plus} />}
            onClick={startNewTask}
          >
            {t('newTask.open')}
          </SidebarButton>
          <AppNav boardsLit={lit.boards} boardLit={lit.board} />
          <Favorites lit={lit.favorite} onOpen={lit.openFavorite} />
          <ShelfLinks archivesLit={lit.archives} />
        </>
      }
    >
      <NewTaskHighlightProvider>
        <Outlet />
        <AppFeedback />
        <NewTaskFromUrl inBoardId={inBoardId} />
      </NewTaskHighlightProvider>
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
  onNewTask
}: {
  searchRef: RefObject<HTMLInputElement | null>
  onNewTask: () => void
}): ReactElement {
  const { t } = useI18n()
  const { sdk } = useSession()
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('lg'))

  // The platform bar is 48px tall: a medium search bar would fill it.
  const search = (
    <TopBarSearch>
      <SearchField inputRef={searchRef} size={sdk ? 'small' : 'medium'} />
    </TopBarSearch>
  )
  // Wide screens have Create in the sidebar.
  const newTaskButton = phone && (
    <IconButton
      color="primary"
      aria-label={t('newTask.open')}
      onClick={onNewTask}
    >
      <Icon icon={Plus} />
    </IconButton>
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
              {newTaskButton}
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
      {newTaskButton}
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

/**
 * The entry lit in the sidebar: a board keeps Boards lit, as the page it is
 * opened from, or its own entry under Boards, but for a favorite clicked in
 * the sidebar, which stays lit while its board is open.
 */
function useLitEntry(): {
  boards: boolean
  archives: boolean
  board: string | null
  favorite: string | null
  openFavorite: (boardId: string) => void
} {
  const { pathname } = useLocation()
  const boardId = useMatch('/boards/:boardId/*')?.params.boardId ?? null
  const [favorite, setFavorite] = useState<string | null>(null)
  const inBoard = (boardId: string) =>
    pathname === `/boards/${boardId}` ||
    pathname.startsWith(`/boards/${boardId}/`)
  // Left the board: the next time it opens, it is from wherever it is.
  if (favorite !== null && !inBoard(favorite)) setFavorite(null)
  const onFavorite = favorite !== null && inBoard(favorite)
  // An archived board is reached from Archives, which it lights instead.
  const boards = useBoards().data ?? []
  const onArchived = boards.some(board => board.archived && inBoard(board.id))
  const onBoard = pathname.startsWith('/boards/') && !onFavorite

  return {
    boards: pathname === '/' || (onBoard && !onArchived),
    archives: pathname === '/archives' || (onBoard && onArchived),
    board: onBoard && !onArchived ? boardId : null,
    favorite: onFavorite ? favorite : null,
    openFavorite: setFavorite
  }
}

function AppNav({
  boardsLit,
  boardLit
}: {
  boardsLit: boolean
  boardLit: string | null
}): ReactElement {
  const { t } = useI18n()
  const unread = useUnreadNotifications().data ?? 0

  return (
    <Nav aria-label={t('app.mainMenu')}>
      <BoardsNav boardsLit={boardsLit} boardLit={boardLit} />
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
  active,
  icon,
  label,
  count = 0,
  countLabel,
  wideScreenOnly = false
}: {
  to: string
  active?: boolean
  icon: ElementType
  label: string
  count?: number
  countLabel?: string
  wideScreenOnly?: boolean
}): ReactElement {
  const Item = wideScreenOnly ? WideScreenNavItem : BarNavItem
  return (
    <Item>
      <SidebarLink
        to={to}
        active={active}
        label={count > 0 ? countLabel : undefined}
      >
        <CountBadge count={count}>
          <NavIcon icon={icon} />
        </CountBadge>
        <NavText>{label}</NavText>
      </SidebarLink>
    </Item>
  )
}

function ShelfLinks({ archivesLit }: { archivesLit: boolean }): ReactElement {
  const { t } = useI18n()
  return (
    <SidebarShelves label={t('boards.shelves')}>
      <NavItem>
        <SidebarLink to="/archives" active={archivesLit}>
          <NavIcon icon={Archive} />
          <NavText>{t('boards.archives')}</NavText>
        </SidebarLink>
      </NavItem>
    </SidebarShelves>
  )
}

const BOARDS_FOLDED = 'sidebar-boards-folded'

// Folded until unfolded, then remembered on this device only, like a
// filter's layout.
function useBoardsFolded() {
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(BOARDS_FOLDED) !== 'false'
    } catch {
      return true
    }
  })
  const toggle = () => {
    setFolded(!folded)
    try {
      localStorage.setItem(BOARDS_FOLDED, String(!folded))
    } catch {
      // Private browsing: the choice lasts until the page closes.
    }
  }
  return [folded, toggle] as const
}

// Boards, then each active board under it, as the address books of Twake
// Contacts; its arrow folds them away and its + makes a board. Phones keep
// the bottom bar entry only, so there, or folded, Boards stays lit on a board.
function BoardsNav({
  boardsLit,
  boardLit
}: {
  boardsLit: boolean
  boardLit: string | null
}): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('lg'))
  const [creating, setCreating] = useState(false)
  const [folded, toggleFolded] = useBoardsFolded()
  const listed = !phone && !folded
  const foldLabel = t(folded ? 'boards.unfold' : 'boards.fold')
  const boards = (useBoards().data ?? [])
    .filter(board => !board.archived)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <BarNavItem
        secondaryAction={
          <WideScreenAction>
            <Tooltip disableInteractive title={foldLabel}>
              <IconButton
                size="xsmall"
                aria-label={foldLabel}
                aria-expanded={!folded}
                onClick={toggleFolded}
              >
                <Icon icon={folded ? Right : Bottom} size={12} />
              </IconButton>
            </Tooltip>
            <Tooltip disableInteractive title={t('newBoard.title')}>
              <IconButton
                size="xsmall"
                aria-label={t('newBoard.title')}
                onClick={() => {
                  setCreating(true)
                }}
              >
                <Icon icon={Plus} size={14} />
              </IconButton>
            </Tooltip>
          </WideScreenAction>
        }
      >
        <SidebarLink to="/" active={boardsLit && !(listed && boardLit)}>
          <NavIcon icon={HomeIcon} />
          <NavText>{t('boards.title')}</NavText>
        </SidebarLink>
      </BarNavItem>
      {!folded &&
        boards.map(board => (
          <WideScreenNavItem key={board.id} variant="secondary">
            <SidebarLink
              to={`/boards/${board.id}`}
              active={board.id === boardLit}
            >
              <NavIcon icon={Mosaic} />
              <OneLineNavText title={board.name}>{board.name}</OneLineNavText>
            </SidebarLink>
          </WideScreenNavItem>
        ))}
      {creating && (
        <NewBoardDialog
          onClose={() => {
            setCreating(false)
          }}
          onCreated={board => {
            setCreating(false)
            void navigate(`/boards/${board.id}`)
          }}
        />
      )}
    </>
  )
}

function Favorites({
  lit,
  onOpen
}: {
  lit: string | null
  onOpen: (boardId: string) => void
}): ReactElement | null {
  const { t } = useI18n()
  const favorites = (useBoards().data ?? []).filter(
    board => board.favorite && !board.archived
  )
  if (favorites.length === 0) return null

  return (
    <SidebarSection label={t('boards.favorites')}>
      {favorites.map(board => (
        <NavItem key={board.id}>
          <SidebarLink
            to={`/boards/${board.id}`}
            active={lit === board.id}
            onClick={() => {
              onOpen(board.id)
            }}
          >
            <NavIcon icon={Star} />
            <NavText>{board.name}</NavText>
          </SidebarLink>
        </NavItem>
      ))}
    </SidebarSection>
  )
}
