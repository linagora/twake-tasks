import {
  Archive,
  Bell,
  Bottom,
  Calendar,
  CalendarToday,
  Filter,
  HelpOutlined,
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
  MenuItem,
  MenuList,
  Nav,
  NavIcon,
  NavItem,
  NavText,
  Popover,
  Tooltip,
  Typography,
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
  WideScreenAction,
  WideScreenNavItem
} from '@/ds/AppFrame'
import { HomeIcon } from '@/ds/HomeIcon'
import { Icon } from '@/ds/Icon'
import { displayName } from '@/domain/person'
import { SearchField } from '@/ui/agenda/SearchScreen'
import { useBoardName } from '@/ui/boards/BoardsScreen'
import { NewBoardDialog } from '@/ui/boards/NewBoardDialog'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { useBoards } from '@/ui/queries/boards'
import { useFilters } from '@/ui/queries/filters'
import { useUnreadNotifications } from '@/ui/queries/notifications'
import { AppFeedback } from '@/ui/shell/AppFeedback'
import { PlatformBar } from '@/ui/shell/PlatformBar'
import { NewTaskFromUrl } from '@/ui/shell/NewTaskDialog'
import { NewTaskHighlightProvider } from '@/ui/shell/NewTaskHighlight'
import { SidebarLink } from '@/ui/shell/SidebarLink'
import { ShortcutsHelp, useShortcuts } from '@/ui/shell/Shortcuts'
import { agendaPreset, useNewTaskParam } from '@/ui/shell/useNewTaskParam'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'
import { useSettings } from '@/ui/settings/useSettings'

const AGENDAS = ['today', 'upcoming', 'mine'] as const

export function AppShell(): ReactElement {
  const { openNewTask } = useNewTaskParam()
  const { pathname } = useLocation()
  const agenda = AGENDAS.find(view => pathname === `/${view}`)
  const startNewTask = (): void => {
    openNewTask(agenda && agendaPreset(agenda))
  }
  const [help, setHelp] = useState(false)
  const showHelp = (): void => {
    setHelp(true)
  }
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
    help: showHelp
  })

  return (
    <AppFrame
      topBar={
        <Header searchRef={search} onNewTask={startNewTask} onHelp={showHelp} />
      }
      skipLabel={t('app.skipToContent')}
      sidebar={
        <>
          {/* Twake Drive's wording; screen readers still hear what it creates. */}
          <SidebarButton
            startIcon={<Icon icon={Plus} size={12} />}
            aria-label={t('newTask.open')}
            onClick={startNewTask}
          >
            {t('newTask.create')}
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
  onNewTask,
  onHelp
}: {
  searchRef: RefObject<HTMLInputElement | null>
  onNewTask: () => void
  onHelp: () => void
}): ReactElement {
  const { t } = useI18n()
  const { sdk } = useSession()
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('lg'))

  // Small, as Twake Drive's search in its bar.
  const search = (
    <TopBarSearch>
      <SearchField inputRef={searchRef} size="small" />
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
          search: <div className="u-mh-2">{search}</div>,
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
      {newTaskButton}
      <AccountMenu onHelp={onHelp} />
    </TopBar>
  )
}

function AccountMenu({ onHelp }: { onHelp: () => void }): ReactElement {
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
      {/* A Popover rather than a Menu, so that the identity sits outside the
          menu, which holds menu items only. */}
      <Popover
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
        <MenuList
          autoFocusItem
          onKeyDown={event => {
            if (event.key === 'Tab') {
              event.preventDefault()
              close()
            }
            if (event.key === '?') close()
          }}
        >
          {phone && (
            <MenuItem component={RouterLink} to="/filters" onClick={close}>
              <ListItemIcon>
                <Icon icon={Filter} />
              </ListItemIcon>
              <ListItemText>{t('filters.title')}</ListItemText>
            </MenuItem>
          )}
          <MenuItem
            aria-keyshortcuts="?"
            onClick={() => {
              close()
              onHelp()
            }}
          >
            <ListItemIcon>
              <Icon icon={HelpOutlined} />
            </ListItemIcon>
            <ListItemText>{t('shortcuts.title')}</ListItemText>
            <Typography variant="body2" color="textSecondary" aria-hidden>
              ?
            </Typography>
          </MenuItem>
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
        </MenuList>
      </Popover>
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
  const [seen, setSeen] = useState(pathname)
  const inBoard = (boardId: string) =>
    pathname === `/boards/${boardId}` ||
    pathname.startsWith(`/boards/${boardId}/`)
  // Left the board: the next time it opens, it is from wherever it is. The
  // click renders before its navigation lands, so only a new page counts.
  if (seen !== pathname) {
    setSeen(pathname)
    if (favorite !== null && !inBoard(favorite)) setFavorite(null)
  }
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
      <FiltersNav />
    </Nav>
  )
}

function AppNavLink({
  to,
  active,
  icon,
  label,
  count = 0,
  countLabel
}: {
  to: string
  active?: boolean
  icon: ElementType
  label: string
  count?: number
  countLabel?: string
}): ReactElement {
  return (
    <BarNavItem>
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
    </BarNavItem>
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

// Remembered on this device only, like a filter's layout.
function useFolded(key: string, foldedFirst: boolean) {
  const [folded, setFolded] = useState(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved === null ? foldedFirst : saved !== 'false'
    } catch {
      return foldedFirst
    }
  })
  const toggle = () => {
    setFolded(!folded)
    try {
      localStorage.setItem(key, String(!folded))
    } catch {
      // Private browsing: the choice lasts until the page closes.
    }
  }
  return [folded, toggle] as const
}

function FoldButton({
  folded,
  label,
  onClick
}: {
  folded: boolean
  label: string
  onClick: () => void
}): ReactElement {
  return (
    <Tooltip disableInteractive title={label}>
      <IconButton
        size="xsmall"
        aria-label={label}
        aria-expanded={!folded}
        onClick={onClick}
      >
        <Icon icon={folded ? Right : Bottom} size={12} />
      </IconButton>
    </Tooltip>
  )
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
  const [folded, toggleFolded] = useFolded('sidebar-boards-folded', true)
  const listed = !phone && !folded
  const boardName = useBoardName()
  const boards = (useBoards().data ?? [])
    .filter(board => !board.archived)
    .map(board => ({ ...board, name: boardName(board) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <BarNavItem
        secondaryAction={
          <WideScreenAction>
            <FoldButton
              folded={folded}
              label={t(folded ? 'boards.unfold' : 'boards.fold')}
              onClick={toggleFolded}
            />
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
              <OneLineNavText>{board.name}</OneLineNavText>
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
            void navigate(`/boards/${board.id}`, { state: { created: true } })
          }}
        />
      )}
    </>
  )
}

// The phone bottom bar has no room for Filters or its favorites.
function FiltersNav(): ReactElement {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const openId = useMatch('/filters/:filterId')?.params.filterId
  const [folded, toggleFolded] = useFolded('sidebar-filters-folded', false)
  const favorites = (useFilters().data ?? []).filter(filter => filter.favorite)
  const listed = folded ? [] : favorites
  const onFilters = pathname === '/filters' || pathname.startsWith('/filters/')

  return (
    <>
      <WideScreenNavItem
        secondaryAction={
          favorites.length > 0 && (
            <FoldButton
              folded={folded}
              label={t(folded ? 'filters.unfold' : 'filters.fold')}
              onClick={toggleFolded}
            />
          )
        }
      >
        <SidebarLink
          to="/filters"
          active={onFilters && !listed.some(filter => filter.id === openId)}
        >
          <NavIcon icon={Filter} />
          <NavText>{t('filters.title')}</NavText>
        </SidebarLink>
      </WideScreenNavItem>
      {listed.map(filter => (
        <WideScreenNavItem key={filter.id} variant="secondary">
          <SidebarLink
            to={`/filters/${filter.id}`}
            active={filter.id === openId}
          >
            <NavIcon icon={Filter} />
            <OneLineNavText>{filter.name}</OneLineNavText>
          </SidebarLink>
        </WideScreenNavItem>
      ))}
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
  const boardName = useBoardName()
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
            onClick={event => {
              // A modified click opens a new tab and leaves this page as is.
              if (
                !event.ctrlKey &&
                !event.metaKey &&
                !event.shiftKey &&
                !event.altKey
              )
                onOpen(board.id)
            }}
          >
            <NavIcon icon={Star} />
            <NavText>{boardName(board)}</NavText>
          </SidebarLink>
        </NavItem>
      ))}
    </SidebarSection>
  )
}
