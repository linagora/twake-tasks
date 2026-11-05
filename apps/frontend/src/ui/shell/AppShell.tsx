import {
  Archive,
  Bell,
  Bottom,
  Calendar,
  CalendarToday,
  Check,
  Filter,
  Gear,
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
  Typography
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
  BrandMark,
  CountBadge,
  NavActions,
  OneLineNavText,
  SidebarButton,
  SidebarSection,
  SidebarShelves,
  TopBar,
  TopBarSearch
} from '@/ds/AppFrame'
import { useContrast } from '@/ds/contrast'
import { HomeIcon } from '@/ds/HomeIcon'
import { Icon } from '@/ds/Icon'
import { MenuButton, PhoneFab } from '@/ds/PhoneShell'
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
  const { pathname, key } = useLocation()
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
  // The phone menu is open on the page it was opened on: the next one, or
  // the same one followed again, closes it. Forgotten on leaving, so that Back
  // to that page does not open it again.
  const [menuAt, setMenuAt] = useState<string | null>(null)
  if (menuAt !== null && menuAt !== key) setMenuAt(null)
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
      topBar={<Header searchRef={search} onHelp={showHelp} />}
      fab={
        <PhoneFab label={t('newTask.open')} onClick={startNewTask}>
          <Icon icon={Plus} size={20} />
        </PhoneFab>
      }
      skipLabel={t('app.skipToContent')}
      menu={{
        label: t('app.mainMenu'),
        open: menuAt === key,
        setOpen: open => {
          setMenuAt(open ? key : null)
        }
      }}
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
  onHelp
}: {
  searchRef: RefObject<HTMLInputElement | null>
  onHelp: () => void
}): ReactElement {
  const { t } = useI18n()
  const { sdk } = useSession()

  // Small, as Twake Drive's search in its bar. Phones open the menu beside
  // it, as Twake Space.
  const search = (
    <TopBarSearch>
      <MenuButton />
      <SearchField inputRef={searchRef} size="small" />
    </TopBarSearch>
  )

  // The platform bar holds the account.
  if (sdk) {
    return (
      <PlatformBar
        sdk={sdk}
        slots={{ search: <div className="u-mh-2">{search}</div> }}
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
      <AccountMenu onHelp={onHelp} />
    </TopBar>
  )
}

function AccountMenu({ onHelp }: { onHelp: () => void }): ReactElement {
  const { t } = useI18n()
  const { user, signOut } = useSession()
  const contrast = useContrast()
  const { data: settings } = useSettings()
  const email = user.email ?? ''
  const name = displayName({ email, name: settings?.name ?? user.name ?? null })
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
          {/* Stays open, so the change shows at once. */}
          <MenuItem
            role="menuitemcheckbox"
            aria-checked={contrast.high}
            onClick={() => {
              contrast.setChoice(contrast.high ? 'standard' : 'high')
            }}
          >
            <ListItemIcon>
              {contrast.high && <Icon icon={Check} />}
            </ListItemIcon>
            <ListItemText>{t('account.highContrast')}</ListItemText>
          </MenuItem>
          <Divider component="li" />
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
    <NavItem>
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
    </NavItem>
  )
}

function ShelfLinks({ archivesLit }: { archivesLit: boolean }): ReactElement {
  const { t } = useI18n()
  return (
    <>
      <SidebarShelves label={t('boards.shelves')}>
        <NavItem>
          <SidebarLink to="/archives" active={archivesLit}>
            <NavIcon icon={Archive} />
            <NavText>{t('boards.archives')}</NavText>
          </SidebarLink>
        </NavItem>
      </SidebarShelves>
      <SidebarShelves label={t('settings.title')}>
        <NavItem>
          <SidebarLink to="/settings">
            <NavIcon icon={Gear} />
            <NavText>{t('settings.title')}</NavText>
          </SidebarLink>
        </NavItem>
      </SidebarShelves>
    </>
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
// Contacts; its arrow folds them away and its + makes a board. Folded, Boards
// stays lit on a board.
function BoardsNav({
  boardsLit,
  boardLit
}: {
  boardsLit: boolean
  boardLit: string | null
}): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [folded, toggleFolded] = useFolded('sidebar-boards-folded', true)
  const boardName = useBoardName()
  const boards = (useBoards().data ?? [])
    .filter(board => !board.archived)
    .map(board => ({ ...board, name: boardName(board) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <NavItem
        secondaryAction={
          <NavActions>
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
          </NavActions>
        }
      >
        <SidebarLink to="/" active={boardsLit && (folded || !boardLit)}>
          <NavIcon icon={HomeIcon} />
          <NavText>{t('boards.title')}</NavText>
        </SidebarLink>
      </NavItem>
      {!folded &&
        boards.map(board => (
          <NavItem key={board.id} variant="secondary">
            <SidebarLink
              to={`/boards/${board.id}`}
              active={board.id === boardLit}
            >
              <NavIcon icon={Mosaic} />
              <OneLineNavText>{board.name}</OneLineNavText>
            </SidebarLink>
          </NavItem>
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
      <NavItem
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
      </NavItem>
      {listed.map(filter => (
        <NavItem key={filter.id} variant="secondary">
          <SidebarLink
            to={`/filters/${filter.id}`}
            active={filter.id === openId}
          >
            <NavIcon icon={Filter} />
            <OneLineNavText>{filter.name}</OneLineNavText>
          </SidebarLink>
        </NavItem>
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
