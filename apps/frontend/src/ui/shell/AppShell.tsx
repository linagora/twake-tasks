import {
  Archive,
  Bell,
  Bottom,
  Eye,
  Icon,
  Logout,
  Mosaic,
  Plus,
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
  type ReactNode,
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
  SidebarHint,
  SidebarSection,
  SidebarSectionEntry,
  SidebarShelves,
  TopBar,
  TopBarSearch,
  TopBarSpacer,
  WideScreenAction,
  WideScreenNavItem
} from '@/ds/AppFrame'
import { HomeIcon } from '@/ds/HomeIcon'
import type { FilterCriteria, SidebarItem } from '@/application/boards'
import { viewIcon } from '@/ds/viewIcons'
import { displayName } from '@/domain/person'
import { NewViewDialog } from '@/ui/agenda/FiltersScreen'
import { SearchField } from '@/ui/agenda/SearchScreen'
import { NewBoardDialog } from '@/ui/boards/NewBoardDialog'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import {
  useBoards,
  useFilters,
  useSidebarSections,
  useUnreadNotifications
} from '@/ui/boards/queries'
import { AppFeedback } from '@/ui/shell/AppFeedback'
import { PlatformBar } from '@/ui/shell/PlatformBar'
import { NewTaskFromUrl } from '@/ui/shell/NewTaskDialog'
import { NewTaskHighlightProvider } from '@/ui/shell/NewTaskHighlight'
import {
  SidebarCreateContext,
  ViewCriteriaContext
} from '@/ui/shell/SidebarCreate'
import { SidebarLink } from '@/ui/shell/SidebarLink'
import {
  CustomSections,
  FAVORITES,
  SidebarDrag,
  useFavoritesDrop,
  useSidebarDrag,
  useSidebarPlaceOf
} from '@/ui/shell/SidebarSections'
import { ShortcutsHelp, useShortcuts } from '@/ui/shell/Shortcuts'
import { useFolded } from '@/ui/shell/useFolded'
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
  // Those of the view shown, which a new task takes.
  const [criteria, setCriteria] = useState<FilterCriteria | null>(null)
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
          {/* Twake Drive's wording; screen readers still hear what it creates. */}
          <SidebarButton
            startIcon={<Icon icon={Plus} size={12} />}
            aria-label={t('newTask.open')}
            onClick={startNewTask}
          >
            {t('newTask.create')}
          </SidebarButton>
          <SidebarDrag>
            <AppNav
              boardsLit={lit.boards}
              boardLit={lit.board}
              viewsLit={lit.views}
              viewLit={lit.view}
            />
            <Favorites
              lit={lit.favorite?.origin === FAVORITES ? lit.favorite.id : null}
              onOpen={id => {
                lit.openFavorite(FAVORITES, id)
              }}
            />
            <CustomSections lit={lit.favorite} onOpen={lit.openFavorite} />
          </SidebarDrag>
          <ShelfLinks archivesLit={lit.archives} />
        </>
      }
    >
      <NewTaskHighlightProvider>
        <SidebarCreateContext value>
          <ViewCriteriaContext value={setCriteria}>
            <Outlet />
          </ViewCriteriaContext>
        </SidebarCreateContext>
        <AppFeedback />
        <NewTaskFromUrl inBoardId={inBoardId} criteria={criteria} />
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
                  <Icon icon={Eye} />
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
              <Icon icon={Eye} />
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
 * The entry lit in the sidebar: a board or view in Favorites or a section the
 * person added lights its entry there, however it was opened, or the entry
 * clicked while its board or view is open. Any other board keeps Boards lit,
 * as the page it is opened from, or its own entry under Boards, and a view
 * Views or its entry under Views.
 */
function useLitEntry(): {
  boards: boolean
  archives: boolean
  board: string | null
  views: boolean
  view: string | null
  favorite: { origin: string; id: string } | null
  openFavorite: (origin: string, id: string) => void
} {
  const { pathname } = useLocation()
  const boardId = useMatch('/boards/:boardId/*')?.params.boardId ?? null
  const filterId = useMatch('/filters/:filterId/*')?.params.filterId ?? null
  const [favorite, setFavorite] = useState<{
    origin: string
    id: string
  } | null>(null)
  const inPage = (root: string, id: string) =>
    pathname === `/${root}/${id}` || pathname.startsWith(`/${root}/${id}/`)
  const inBoard = (boardId: string) => inPage('boards', boardId)
  const clicked =
    favorite !== null &&
    (inBoard(favorite.id) || inPage('filters', favorite.id))
  // Left the board or view: the next time it opens, it is from wherever it is.
  // Only once the page changes, as the click on a favorite comes before it.
  const [seen, setSeen] = useState(pathname)
  if (seen !== pathname) {
    setSeen(pathname)
    if (favorite !== null && !clicked) setFavorite(null)
  }
  // An archived board is reached from Archives, which it lights instead.
  const boards = useBoards().data ?? []
  const onArchived = boards.some(board => board.archived && inBoard(board.id))
  const openId = boardId ?? filterId
  const placed = useSidebarPlaceOf(
    boardId
      ? { kind: 'board', id: boardId }
      : filterId
        ? { kind: 'view', id: filterId }
        : null
  )
  const shownIn = clicked
    ? favorite
    : placed !== null && openId !== null && !onArchived
      ? { origin: placed, id: openId }
      : null
  const onFavorite = shownIn !== null
  const onBoard = pathname.startsWith('/boards/') && !onFavorite
  const onViews =
    (pathname === '/filters' || pathname.startsWith('/filters/')) && !onFavorite

  return {
    boards: pathname === '/' || (onBoard && !onArchived),
    archives: pathname === '/archives' || (onBoard && onArchived),
    board: onBoard && !onArchived ? boardId : null,
    views: onViews,
    view: onViews ? filterId : null,
    favorite: shownIn,
    openFavorite: (origin, id) => {
      setFavorite({ origin, id })
    }
  }
}

function AppNav({
  boardsLit,
  boardLit,
  viewsLit,
  viewLit
}: {
  boardsLit: boolean
  boardLit: string | null
  viewsLit: boolean
  viewLit: string | null
}): ReactElement {
  const { t } = useI18n()
  const unread = useUnreadNotifications().data ?? 0

  return (
    <Nav aria-label={t('app.mainMenu')}>
      <BoardsNav boardsLit={boardsLit} boardLit={boardLit} />
      <ViewsNav viewsLit={viewsLit} viewLit={viewLit} />
      <AppNavLink
        to="/notifications"
        icon={Bell}
        label={t('notifications.title')}
        count={unread}
        countLabel={t('notifications.unread', { count: unread })}
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
  const boards = (useBoards().data ?? [])
    .filter(board => !board.archived)
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
          <DraggableEntry
            key={board.id}
            origin="boards"
            item={{ kind: 'board', id: board.id }}
            label={board.name}
            icon={Mosaic}
            listed
          >
            <SidebarLink
              to={`/boards/${board.id}`}
              active={board.id === boardLit}
            >
              <NavIcon icon={Mosaic} />
              <OneLineNavText title={board.name}>{board.name}</OneLineNavText>
            </SidebarLink>
          </DraggableEntry>
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

// Views, then each view under it, as Boards its boards; phones keep the
// bottom bar entry only.
function ViewsNav({
  viewsLit,
  viewLit
}: {
  viewsLit: boolean
  viewLit: string | null
}): ReactElement {
  const { t } = useI18n()
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('lg'))
  const [creating, setCreating] = useState(false)
  const [folded, toggleFolded] = useFolded('sidebar-views-folded', true)
  const foldLabel = t(folded ? 'filters.unfold' : 'filters.fold')
  const views = [...(useFilters().data ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name)
  )

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
            <Tooltip disableInteractive title={t('filters.createTitle')}>
              <IconButton
                size="xsmall"
                aria-label={t('filters.createTitle')}
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
        <SidebarLink
          to="/filters"
          active={viewsLit && (phone || folded || viewLit === null)}
        >
          <NavIcon icon={Eye} />
          <NavText>{t('filters.title')}</NavText>
        </SidebarLink>
      </BarNavItem>
      {!folded &&
        views.map(view => (
          <DraggableEntry
            key={view.id}
            origin="views"
            item={{ kind: 'view', id: view.id }}
            label={view.name}
            icon={viewIcon(view.icon)}
            listed
          >
            <SidebarLink
              to={`/filters/${view.id}`}
              active={view.id === viewLit}
            >
              <NavIcon icon={viewIcon(view.icon)} />
              <NavText>{view.name}</NavText>
            </SidebarLink>
          </DraggableEntry>
        ))}
      {creating && (
        <NewViewDialog
          onClose={() => {
            setCreating(false)
          }}
          onCreated={() => {
            setCreating(false)
          }}
        />
      )}
    </>
  )
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

function Favorites({
  lit,
  onOpen
}: {
  lit: string | null
  onOpen: (id: string) => void
}): ReactElement | null {
  const { t } = useI18n()
  const sections = useSidebarSections().data ?? []
  const drop = useFavoritesDrop()
  const [folded, toggleFolded] = useFolded('sidebar-favorites-folded', false)
  // The favorites in another section show there only.
  const placed = (item: SidebarItem) =>
    sections.some(section =>
      section.items.some(each => each.kind === item.kind && each.id === item.id)
    )
  const favorites = (useBoards().data ?? []).filter(
    board =>
      board.favorite &&
      !board.archived &&
      !placed({ kind: 'board', id: board.id })
  )
  const views = (useFilters().data ?? []).filter(
    filter => filter.favorite && !placed({ kind: 'view', id: filter.id })
  )
  const empty = favorites.length === 0 && views.length === 0
  // Kept, though empty, as the place to drop what leaves a section.
  if (empty && sections.length === 0) return null

  return (
    <SidebarSection
      label={t('boards.favorites')}
      fold={{
        folded,
        label: t(folded ? 'sidebar.unfold' : 'sidebar.fold', {
          name: t('boards.favorites')
        }),
        onToggle: toggleFolded
      }}
      {...drop}
    >
      {favorites.map(board => (
        <DraggableEntry
          key={board.id}
          origin={FAVORITES}
          item={{ kind: 'board', id: board.id }}
          label={board.name}
          icon={Mosaic}
        >
          <SidebarLink
            to={`/boards/${board.id}`}
            active={lit === board.id}
            onClick={() => {
              onOpen(board.id)
            }}
          >
            <NavIcon icon={Star} />
            <OneLineNavText title={board.name}>{board.name}</OneLineNavText>
          </SidebarLink>
        </DraggableEntry>
      ))}
      {views.map(filter => (
        <DraggableEntry
          key={filter.id}
          origin={FAVORITES}
          item={{ kind: 'view', id: filter.id }}
          label={filter.name}
          icon={viewIcon(filter.icon)}
        >
          <SidebarLink
            to={`/filters/${filter.id}`}
            active={lit === filter.id}
            onClick={() => {
              onOpen(filter.id)
            }}
          >
            <NavIcon icon={viewIcon(filter.icon)} />
            <OneLineNavText title={filter.name}>{filter.name}</OneLineNavText>
          </SidebarLink>
        </DraggableEntry>
      ))}
      {empty && <SidebarHint>{t('sidebar.empty')}</SidebarHint>}
    </SidebarSection>
  )
}

// An entry of Boards, Views or Favorites, which a drag moves into a section;
// in Favorites drawn as in the other sections.
function DraggableEntry({
  origin,
  item,
  label,
  icon,
  listed = false,
  children
}: {
  origin: string
  item: SidebarItem
  label: string
  icon: ElementType
  /** Listed under Boards or Views, on wide screens only. */
  listed?: boolean
  children: ReactNode
}): ReactElement {
  const drag = useSidebarDrag(origin, item, label, icon)
  return listed ? (
    <WideScreenNavItem variant="secondary" {...drag}>
      {children}
    </WideScreenNavItem>
  ) : (
    <SidebarSectionEntry {...drag}>{children}</SidebarSectionEntry>
  )
}
