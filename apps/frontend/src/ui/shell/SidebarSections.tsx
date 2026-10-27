import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DroppableContainer
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Check,
  Dots,
  Down,
  FolderAdd,
  Icon,
  Mosaic,
  Pen,
  Plus,
  Trash,
  Up
} from '@linagora/twake-icons'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  NavIcon,
  TextField,
  Typography
} from '@linagora/twake-mui'
import {
  createContext,
  Fragment,
  useContext,
  useId,
  useRef,
  useState,
  type DragEvent,
  type ElementType,
  type ReactElement,
  type ReactNode
} from 'react'

import type { SidebarItem, SidebarSection } from '@/application/boards'
import {
  droppedItem,
  holds,
  movedSection,
  sectionOf,
  withItem,
  withoutItem
} from '@/application/sidebarSections'
import { ClosableTitle } from '@/ds/ClosableTitle'
import {
  OneLineNavText,
  SidebarDragPreview,
  SidebarDropSlot,
  SidebarHint,
  SidebarSection as SectionList,
  SidebarSectionEntry
} from '@/ds/AppFrame'
import { SubMenuForm, SubMenuIcon, SubMenuItem } from '@/ds/SubMenu'
import { viewIcon } from '@/ds/viewIcons'
import {
  useBoards,
  useCreateSidebarSection,
  useDeleteSidebarSection,
  useFilters,
  useRenameSidebarSection,
  useSaveSidebarLayout,
  useSetFavorite,
  useSetFilterFavorite,
  useSidebarSections
} from '@/ui/boards/queries'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'
import { SidebarLink } from '@/ui/shell/SidebarLink'
import { useFolded } from '@/ui/shell/useFolded'

/** What a drag carries: the board or view, as the sidebar shows it. */
interface EntryDrag {
  item: SidebarItem
  label: string
  icon: ElementType
}

/**
 * Favorites, where a drag or the menu puts what it holds, the favorites in no
 * other section, whatever its id.
 */
export const FAVORITES = 'favorites'

// Out of the sidebar: neither starred nor in a section.
const NOWHERE = 'nowhere'

/** Where a drag lands: a section, at the place of one of its items or at its end. */
interface EntryDrop {
  sectionId: string
  index: number
  slot: 'item' | 'section'
}

// A drop on an item sorts it there; on the rest of its section, at its end.
const collisions: CollisionDetection = args => {
  const hits = pointerWithin(args)
  const onItems = hits.filter(
    hit =>
      (
        (hit.data?.droppableContainer as DroppableContainer | undefined)?.data
          .current as EntryDrop | undefined
      )?.slot === 'item'
  )
  return onItems.length > 0 ? onItems : hits
}

// Only a pointer drags, the keyboard going through the menus: the default
// announcements, in English, would say keys that do nothing.
const silent: Announcements = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined
}

// A drag ends with a click on what it ends over, which must not open it.
const JustDragged = createContext<() => boolean>(() => false)

// What is dragged and where it would land, for the section to show the slot.
const DragTarget = createContext<{
  dragged: EntryDrag
  over: EntryDrop
} | null>(null)

/**
 * Puts a board or view back in Favorites, out of the section it was in, and
 * stars it if it was not.
 */
function useMoveToFavorites(): (item: SidebarItem) => void {
  const sections = useSidebarSections().data ?? []
  const boards = useBoards().data ?? []
  const views = useFilters().data ?? []
  const save = useSaveSidebarLayout()
  const starBoard = useSetFavorite()
  const starView = useSetFilterFavorite()
  return item => {
    if (sectionOf(sections, item) !== null) {
      save.mutate(withoutItem(sections, item))
    }
    if (item.kind === 'board') {
      if (!boards.find(board => board.id === item.id)?.favorite) {
        starBoard.mutate({ boardId: item.id, favorite: true })
      }
    } else if (!views.find(view => view.id === item.id)?.favorite) {
      starView.mutate({ filterId: item.id, favorite: true })
    }
  }
}

/**
 * Drags the boards and views of the sidebar into Favorites or the sections
 * the person added, each being in one of them at most: dropped in one, it
 * leaves the other. A mouse drags them, a finger after a long press; the
 * keyboard moves them from their menus.
 */
export function SidebarDrag({
  children
}: {
  children: ReactNode
}): ReactElement {
  const sections = useSidebarSections().data ?? []
  const save = useSaveSidebarLayout()
  const moveToFavorites = useMoveToFavorites()
  const [dragged, setDragged] = useState<EntryDrag | null>(null)
  const [over, setOver] = useState<EntryDrop | null>(null)
  const endedAt = useRef(0)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 6 }
    })
  )

  return (
    <JustDragged.Provider value={() => Date.now() - endedAt.current < 300}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisions}
        accessibility={{ announcements: silent }}
        onDragStart={({ active }) => {
          setDragged(active.data.current as EntryDrag)
        }}
        onDragOver={event => {
          setOver((event.over?.data.current as EntryDrop | undefined) ?? null)
        }}
        onDragCancel={() => {
          setDragged(null)
          setOver(null)
        }}
        onDragEnd={({ active, over }) => {
          setDragged(null)
          setOver(null)
          endedAt.current = Date.now()
          const from = active.data.current as EntryDrag | undefined
          const to = over?.data.current as EntryDrop | undefined
          if (!from || !to) return
          if (to.sectionId === FAVORITES) {
            moveToFavorites(from.item)
            return
          }
          const next = droppedItem(sections, from.item, to)
          if (JSON.stringify(next) !== JSON.stringify(sections)) {
            save.mutate(next)
          }
        }}
      >
        <DragTarget value={dragged && over && { dragged, over }}>
          {children}
        </DragTarget>
        <DragOverlay dropAnimation={null}>
          {dragged && (
            <SidebarDragPreview icon={dragged.icon} label={dragged.label} />
          )}
        </DragOverlay>
      </DndContext>
    </JustDragged.Provider>
  )
}

// The link a native drag would carry off instead of the entry.
const noNativeDrag = (event: DragEvent) => {
  event.preventDefault()
}

/**
 * Makes a sidebar entry of Boards, Views or Favorites draggable into a
 * section: spread on its item.
 */
export function useSidebarDrag(
  origin: string,
  item: SidebarItem,
  label: string,
  icon: ElementType
) {
  const justDragged = useContext(JustDragged)
  const { setNodeRef, listeners } = useDraggable({
    id: `${origin}|${item.kind}:${item.id}`,
    data: { item, label, icon } satisfies EntryDrag
  })
  return {
    ref: setNodeRef,
    ...listeners,
    onDragStart: noNativeDrag,
    onClickCapture: (event: { preventDefault: () => void }) => {
      if (justDragged()) event.preventDefault()
    }
  }
}

/** Makes Favorites a place to drop a board or view back in. */
export function useFavoritesDrop() {
  const { setNodeRef, isOver } = useDroppable({
    id: `section:${FAVORITES}`,
    data: {
      sectionId: FAVORITES,
      index: 0,
      slot: 'section'
    } satisfies EntryDrop
  })
  return { listRef: setNodeRef, highlighted: isOver }
}

interface Shown {
  item: SidebarItem
  index: number
  label: string
  icon: ElementType
  to: string
}

/** The name a section shows: Favorites, the app's until renamed. */
function useNameOf(): (section: SidebarSection) => string {
  const { t } = useI18n()
  return section => section.name ?? t('boards.favorites')
}

/** The boards and views a section holds that the person still has. */
function useShownItems(): (section: SidebarSection) => Shown[] {
  const boards = useBoards().data ?? []
  const views = useFilters().data ?? []
  return section =>
    section.items.flatMap((item, index): Shown[] => {
      if (item.kind === 'board') {
        const board = boards.find(each => each.id === item.id)
        return board && !board.archived
          ? [
              {
                item,
                index,
                label: board.name,
                icon: Mosaic,
                to: `/boards/${board.id}`
              }
            ]
          : []
      }
      const view = views.find(each => each.id === item.id)
      return view
        ? [
            {
              item,
              index,
              label: view.name,
              icon: viewIcon(view.icon),
              to: `/filters/${view.id}`
            }
          ]
        : []
    })
}

/**
 * The sections of the sidebar in the person's order, Favorites among them,
 * which `favorites` draws, given its name and menu.
 */
export function SidebarSections({
  lit,
  onOpen,
  favorites
}: {
  /** The section and item lit, when opened from a section. */
  lit: { origin: string; id: string } | null
  onOpen: (origin: string, id: string) => void
  favorites: (name: string, menu: ReactNode) => ReactNode
}): ReactElement {
  const { t } = useI18n()
  const sections = useSidebarSections().data ?? []
  const shown = useShownItems()
  const nameOf = useNameOf()

  return (
    <>
      {/* Until the sidebar's own comes, Favorites leads under its usual name. */}
      {!sections.some(section => section.favorites) &&
        favorites(t('boards.favorites'), null)}
      {sections.map((section, index) => {
        const menu = (
          <SectionMenu
            section={section}
            first={index === 0}
            last={index === sections.length - 1}
          />
        )
        return section.favorites ? (
          <Fragment key={section.id}>
            {favorites(nameOf(section), menu)}
          </Fragment>
        ) : (
          <CustomSection
            key={section.id}
            section={section}
            shown={shown(section)}
            menu={menu}
            lit={lit?.origin === section.id ? lit.id : null}
            onOpen={id => {
              onOpen(section.id, id)
            }}
          />
        )
      })}
    </>
  )
}

function CustomSection({
  section,
  shown,
  menu,
  lit,
  onOpen
}: {
  section: SidebarSection
  shown: Shown[]
  menu: ReactNode
  lit: string | null
  onOpen: (id: string) => void
}): ReactElement {
  const { t } = useI18n()
  const name = useNameOf()(section)
  const target = useContext(DragTarget)
  const { setNodeRef } = useDroppable({
    id: `section:${section.id}`,
    data: {
      sectionId: section.id,
      index: section.items.length,
      slot: 'section'
    } satisfies EntryDrop
  })
  const sortIds = shown.map(entry => sortIdOf(section.id, entry.item))
  const [folded, toggleFolded] = useFolded(
    `sidebar-section-folded-${section.id}`,
    false
  )
  const landing = target?.over.sectionId === section.id ? target : null
  // From another section, the slot it would take; within its own, the
  // entries make way for it.
  const slot =
    landing && !holds(section, landing.dragged.item)
      ? shown.filter(entry => entry.index < landing.over.index).length
      : null
  const slotEntry = landing && slot !== null && (
    <SidebarDropSlot
      key="drop-slot"
      icon={landing.dragged.icon}
      label={landing.dragged.label}
    />
  )

  return (
    <SectionList
      label={name}
      listRef={setNodeRef}
      highlighted={landing !== null}
      fold={{
        folded,
        label: t(folded ? 'sidebar.unfold' : 'sidebar.fold', { name }),
        onToggle: toggleFolded
      }}
      action={menu}
    >
      <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
        {shown.map((entry, position) => (
          <Fragment key={sortIdOf(section.id, entry.item)}>
            {position === slot && slotEntry}
            <SectionEntry
              section={section}
              entry={entry}
              lit={lit === entry.item.id}
              onOpen={() => {
                onOpen(entry.item.id)
              }}
            />
          </Fragment>
        ))}
        {slot === shown.length && slotEntry}
      </SortableContext>
      {shown.length === 0 && slot === null && (
        <SidebarHint>{t('sidebar.empty')}</SidebarHint>
      )}
    </SectionList>
  )
}

const sortIdOf = (sectionId: string, item: SidebarItem) =>
  `${sectionId}|${item.kind}:${item.id}`

function SectionEntry({
  section,
  entry,
  lit,
  onOpen
}: {
  section: SidebarSection
  entry: Shown
  lit: boolean
  onOpen: () => void
}): ReactElement {
  const justDragged = useContext(JustDragged)
  const { setNodeRef, listeners, transform, transition, isDragging } =
    useSortable({
      id: sortIdOf(section.id, entry.item),
      data: {
        item: entry.item,
        sectionId: section.id,
        label: entry.label,
        icon: entry.icon,
        index: entry.index,
        slot: 'item'
      } satisfies EntryDrag & EntryDrop
    })

  return (
    <SidebarSectionEntry
      ref={setNodeRef}
      {...listeners}
      onDragStart={noNativeDrag}
      onClickCapture={event => {
        if (justDragged()) event.preventDefault()
      }}
      // eslint-disable-next-line no-restricted-syntax -- changes every frame of a drag; sx would mint a class per frame
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1
      }}
    >
      <SidebarLink to={entry.to} active={lit} onClick={onOpen}>
        <NavIcon icon={entry.icon} />
        <OneLineNavText title={entry.label}>{entry.label}</OneLineNavText>
      </SidebarLink>
    </SidebarSectionEntry>
  )
}

function SectionMenu({
  section,
  first,
  last
}: {
  section: SidebarSection
  first: boolean
  last: boolean
}): ReactElement {
  const { t } = useI18n()
  const name = useNameOf()(section)
  const sections = useSidebarSections().data ?? []
  const save = useSaveSidebarLayout()
  const rename = useRenameSidebarSection()
  const remove = useDeleteSidebarSection()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  const titleId = useId()
  const close = () => {
    setAnchor(null)
  }
  const item = (
    icon: ElementType,
    label: string,
    action: () => void,
    disabled = false
  ) => (
    <MenuItem
      disabled={disabled}
      onClick={() => {
        close()
        action()
      }}
    >
      <ListItemIcon>
        <Icon icon={icon} />
      </ListItemIcon>
      <ListItemText>{label}</ListItemText>
    </MenuItem>
  )

  return (
    <>
      <IconButton
        size="xsmall"
        aria-label={t('sidebar.sectionMenu', { name })}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={event => {
          setAnchor(event.currentTarget)
        }}
      >
        <Icon icon={Dots} size={14} />
      </IconButton>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={close}>
        {item(Pen, t('sidebar.rename'), () => {
          setDialog('rename')
        })}
        {item(
          Up,
          t('sidebar.moveUp'),
          () => {
            save.mutate(movedSection(sections, section.id, -1))
          },
          first
        )}
        {item(
          Down,
          t('sidebar.moveDown'),
          () => {
            save.mutate(movedSection(sections, section.id, 1))
          },
          last
        )}
        {/* Favorites stays, as the place of the favorites in no other. */}
        {!section.favorites &&
          item(Trash, t('sidebar.delete'), () => {
            setDialog('delete')
          })}
      </Menu>
      {dialog === 'rename' && (
        <SectionNameDialog
          title={t('sidebar.renameTitle')}
          initial={name}
          submitLabel={t('sidebar.save')}
          pending={rename.isPending}
          failed={rename.isError}
          onClose={() => {
            setDialog(null)
          }}
          onSubmit={name => {
            rename.mutate(
              { sectionId: section.id, name },
              {
                onSuccess: () => {
                  setDialog(null)
                }
              }
            )
          }}
        />
      )}
      {dialog === 'delete' && (
        <Dialog
          open
          onClose={() => {
            setDialog(null)
          }}
          aria-labelledby={titleId}
        >
          <DialogTitle id={titleId}>
            {t('sidebar.deleteTitle', { name })}
          </DialogTitle>
          <DialogContent>
            <Typography>{t('sidebar.deleteText')}</Typography>
          </DialogContent>
          <DialogActions>
            {remove.isError && (
              <Typography role="alert" variant="caption" color="error">
                {t('sidebar.failed')}
              </Typography>
            )}
            <Button
              variant="text"
              onClick={() => {
                setDialog(null)
              }}
            >
              {t('sidebar.cancel')}
            </Button>
            <Button
              color="error"
              startIcon={<Icon icon={Trash} />}
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(section.id, {
                  onSuccess: () => {
                    setDialog(null)
                  }
                })
              }}
            >
              {t('sidebar.deleteConfirm')}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  )
}

function SectionNameDialog({
  title,
  initial = '',
  submitLabel,
  pending,
  failed,
  onClose,
  onSubmit
}: {
  title: string
  initial?: string
  submitLabel: string
  pending: boolean
  failed: boolean
  onClose: () => void
  onSubmit: (name: string) => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const [name, setName] = useState(initial)

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <form
        onSubmit={event => {
          event.preventDefault()
          if (name.trim()) onSubmit(name.trim())
        }}
      >
        <ClosableTitle
          id={titleId}
          title={title}
          closeLabel={t('sidebar.close')}
          onClose={onClose}
        />
        <DialogContent>
          <TextField
            label={t('sidebar.name')}
            value={name}
            onChange={event => {
              setName(event.target.value)
            }}
            required
            fullWidth
            inputRef={focusOnMount}
            margin="dense"
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          {failed && (
            <Typography role="alert" variant="body2" color="error">
              {t('sidebar.failed')}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button type="submit" disabled={pending || !name.trim()}>
            {submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

/**
 * Where a board or view shows in the sidebar, and how to show it elsewhere:
 * in Favorites, a section the person added, or nowhere, which unstars it.
 */
/**
 * Where a board or view shows in the sidebar: Favorites, or the id of one of
 * the person's sections; null, neither starred nor in a section, it does not.
 */
export function useSidebarPlaceOf(item: SidebarItem | null): string | null {
  const sections = useSidebarSections().data ?? []
  const boards = useBoards().data ?? []
  const views = useFilters().data ?? []
  if (!item) return null
  const starred =
    item.kind === 'board'
      ? boards.some(board => board.id === item.id && board.favorite)
      : views.some(view => view.id === item.id && view.favorite)
  return sectionOf(sections, item) ?? (starred ? FAVORITES : null)
}

function usePlaceInSidebar(item: SidebarItem): {
  current: string
  place: (where: string) => void
} {
  const sections = useSidebarSections().data ?? []
  const save = useSaveSidebarLayout()
  const moveToFavorites = useMoveToFavorites()
  const starBoard = useSetFavorite()
  const starView = useSetFilterFavorite()
  const current = useSidebarPlaceOf(item) ?? NOWHERE
  return {
    current,
    place: where => {
      if (where === current) return
      if (where === NOWHERE) {
        // Unstarred, it leaves its section too.
        if (item.kind === 'board') {
          starBoard.mutate({ boardId: item.id, favorite: false })
        } else {
          starView.mutate({ filterId: item.id, favorite: false })
        }
      } else if (where === FAVORITES) {
        moveToFavorites(item)
      } else {
        save.mutate(withItem(sections, where, item))
      }
    }
  }
}

// Wide enough for the name of a new section and its buttons, as soon as it
// opens, for naming one not to widen it.
const NEW_SECTION_WIDTH = 280

/**
 * Show in the sidebar, in the menu of a board or view, as Label as in Twake
 * Mail: the places it can show in, the current one checked, then a new
 * section, named right there.
 */
export function SidebarPlaceMenuItem({
  item,
  onPicked
}: {
  item: SidebarItem
  /** Closes the menu it is in. */
  onPicked: () => void
}): ReactElement {
  const { t } = useI18n()
  const sections = useSidebarSections().data ?? []
  const nameOf = useNameOf()
  const { current, place } = usePlaceInSidebar(item)
  const [naming, setNaming] = useState(false)
  const option = (where: string, label: string) => (
    <MenuItem
      key={where}
      role="menuitemradio"
      aria-checked={where === current}
      onClick={() => {
        onPicked()
        place(where)
      }}
    >
      <SubMenuIcon hidden={where !== current}>
        <Icon icon={Check} />
      </SubMenuIcon>
      <ListItemText>{label}</ListItemText>
    </MenuItem>
  )

  return (
    <SubMenuItem
      icon={FolderAdd}
      label={t('sidebar.addToSection')}
      width={NEW_SECTION_WIDTH}
    >
      {!sections.some(section => section.favorites) &&
        option(FAVORITES, t('boards.favorites'))}
      {sections.map(section =>
        option(section.favorites ? FAVORITES : section.id, nameOf(section))
      )}
      {option(NOWHERE, t('sidebar.nowhere'))}
      <Divider />
      {naming ? (
        <NewSectionField
          item={item}
          onDone={onPicked}
          onCancel={() => {
            setNaming(false)
          }}
        />
      ) : (
        <MenuItem
          onClick={event => {
            // It stays open, to name the section.
            event.stopPropagation()
            setNaming(true)
          }}
        >
          <ListItemIcon>
            <Icon icon={Plus} />
          </ListItemIcon>
          <ListItemText>{t('sidebar.newSectionOption')}</ListItemText>
        </MenuItem>
      )}
    </SubMenuItem>
  )
}

/**
 * Names a new section of the sidebar in the menu, as a task is added in a
 * column: the section then holds the board or view.
 */
function NewSectionField({
  item,
  onDone,
  onCancel
}: {
  item: SidebarItem
  onDone: () => void
  onCancel: () => void
}): ReactElement {
  const { t } = useI18n()
  const sections = useSidebarSections().data ?? []
  const create = useCreateSidebarSection()
  const save = useSaveSidebarLayout()
  const [name, setName] = useState('')
  const pending = create.isPending || save.isPending

  return (
    <SubMenuForm
      role="none"
      // Clicks and keys are its own, not the menu's.
      onClick={event => {
        event.stopPropagation()
      }}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key === 'Escape') onCancel()
      }}
    >
      <form
        onSubmit={event => {
          event.preventDefault()
          const trimmed = name.trim()
          if (!trimmed) return
          create.mutate(trimmed, {
            onSuccess: ({ id }) => {
              save.mutate(
                withItem(
                  [
                    ...sections,
                    { id, name: trimmed, favorites: false, items: [] }
                  ],
                  id,
                  item
                ),
                { onSuccess: onDone }
              )
            }
          })
        }}
      >
        <TextField
          label={t('sidebar.name')}
          value={name}
          onChange={event => {
            setName(event.target.value)
          }}
          size="small"
          fullWidth
          inputRef={focusOnMount}
          slotProps={{ htmlInput: { maxLength: 100 } }}
        />
        {(create.isError || save.isError) && (
          <Typography role="alert" variant="caption" color="error">
            {t('sidebar.failed')}
          </Typography>
        )}
        <Button type="submit" size="small" disabled={pending || !name.trim()}>
          {t('sidebar.create')}
        </Button>
        <Button variant="text" size="small" onClick={onCancel}>
          {t('board.cancel')}
        </Button>
      </form>
    </SubMenuForm>
  )
}
