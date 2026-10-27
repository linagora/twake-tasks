import {
  closestCenter,
  pointerWithin,
  type Active,
  type Announcements,
  type CollisionDetection,
  type Over
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import {
  Folder,
  Gear,
  Icon,
  Pen,
  Plus,
  Star,
  Trash
} from '@linagora/twake-icons'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Tooltip,
  Typography
} from '@linagora/twake-mui'
import {
  Fragment,
  useId,
  useState,
  type ComponentProps,
  type ComponentType,
  type ElementType,
  type ReactElement
} from 'react'
import { useHref, useLinkClickHandler } from 'react-router'

import type { SidebarItem, SidebarSection } from '@/application/boards'
import { droppedItem } from '@/application/sidebarSections'
import { ClosableTitle } from '@/ds/ClosableTitle'
import { ListSection } from '@/ds/ListSection'
import {
  SortableEntry,
  SortableRow,
  SortableRows,
  useRowDrag,
  type RowData
} from '@/ds/SortableRows'
import { SubMenuActionGap } from '@/ds/SubMenu'
import { atPointer } from '@/ui/boards/BoardDrag'
import { PageCrumbs } from '@/ui/boards/Crumbs'
import {
  useCreateSidebarSection,
  useDeleteSidebarSection,
  useRenameSidebarSection,
  useSaveSidebarLayout,
  useSidebarSections
} from '@/ui/boards/queries'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'
import {
  useMoveToFavorites,
  useNameOf,
  useShownItems,
  type Shown
} from '@/ui/shell/SidebarSections'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

/** The settings of the app, reached from the gear of the top bar. */
export function SettingsScreen(): ReactElement {
  const { t } = useI18n()
  useDocumentTitle(t('settings.title'))

  return (
    <main className="u-ph-2 u-pt-half u-pb-2">
      <PageCrumbs
        origin={{ icon: Gear, label: t('settings.title'), to: '/settings' }}
        heading
      />
      <SidebarSectionsSettings />
    </main>
  )
}

/**
 * The sections of the sidebar, in its order: added, renamed, dragged into
 * another order and deleted here, Favorites being there to stay. Each one
 * unfolds the boards and views it holds.
 */
function SidebarSectionsSettings(): ReactElement {
  const { t } = useI18n()
  const sections = useSidebarSections()
  const nameOf = useNameOf()
  const shownIn = useShownItems()
  const save = useSaveSidebarLayout()
  const moveToFavorites = useMoveToFavorites()
  const [creating, setCreating] = useState(false)
  const all = sections.data ?? []
  const ids = all.map(section => section.id)
  const sectionName = (sectionId: string) => {
    const section = all.find(each => each.id === sectionId)
    return section ? nameOf(section) : ''
  }
  const rowName = (row: RowData) =>
    isEntry(row) ? row.label : isSection(row) ? sectionName(row.sectionId) : ''
  const position = (row: RowData | undefined) => ({
    position: row && isSection(row) ? ids.indexOf(row.sectionId) + 1 : 0,
    count: ids.length
  })
  const dataOf = (side: Active | Over | null): RowData | undefined =>
    side?.data.current
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const row = dataOf(active)
      return row && isEntry(row)
        ? t('drag.picked', { task: row.label })
        : t('drag.columnPicked', { section: rowName(row ?? {}) })
    },
    onDragOver: ({ active, over }) => {
      const row = dataOf(active)
      const target = dataOf(over)
      if (!row || !target) return undefined
      return isEntry(row)
        ? t('drag.over', {
            task: row.label,
            place: sectionName(String(target.sectionId))
          })
        : t('drag.columnOver', { section: rowName(row), ...position(target) })
    },
    onDragEnd: ({ active, over }) => {
      const row = dataOf(active) ?? {}
      const target = dataOf(over)
      if (isEntry(row)) {
        return target
          ? t('drag.dropped', {
              task: row.label,
              place: sectionName(String(target.sectionId))
            })
          : t('drag.canceled', { task: row.label })
      }
      return target
        ? t('drag.columnDropped', {
            section: rowName(row),
            ...position(target)
          })
        : t('drag.columnCanceled', { section: rowName(row) })
    },
    onDragCancel: ({ active }) => {
      const row = dataOf(active) ?? {}
      return isEntry(row)
        ? t('drag.canceled', { task: row.label })
        : t('drag.columnCanceled', { section: rowName(row) })
    }
  }

  return (
    <ListSection
      title={t('settings.sections')}
      action={
        <Button
          variant="ghost"
          size="small"
          startIcon={<Icon icon={Plus} />}
          onClick={() => {
            setCreating(true)
          }}
        >
          {t('settings.add')}
        </Button>
      }
    >
      {sections.isError && (
        <Typography component="li" role="alert">
          {t('sidebar.failed')}
        </Typography>
      )}
      <SortableRows
        collisionDetection={collisions}
        nameOf={rowName}
        announcements={announcements}
        previewModifiers={[atPointer]}
        instructions={t('settings.dragInstructions')}
        onDrop={(row, target) => {
          if (isSection(row)) {
            if (!isSection(target)) return
            const order = arrayMove(
              ids,
              ids.indexOf(row.sectionId),
              ids.indexOf(target.sectionId)
            )
            save.mutate(
              order.flatMap(id => all.filter(section => section.id === id))
            )
            return
          }
          if (!isEntry(row)) return
          const into = all.find(section => section.id === target.sectionId)
          if (!into) return
          // Favorites holds the favorites in no other, in no order of theirs.
          if (into.favorites) {
            if (into.id !== row.sectionId) moveToFavorites(row.item)
            return
          }
          const next = droppedItem(all, row.item, {
            sectionId: into.id,
            index: isEntry(target) ? target.index : into.items.length
          })
          if (JSON.stringify(next) !== JSON.stringify(all)) save.mutate(next)
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {all.map((section, index) => (
            <Fragment key={section.id}>
              {index > 0 && <Divider component="li" variant="inset" />}
              <SectionRow
                section={section}
                name={nameOf(section)}
                shown={shownIn(section)}
              />
            </Fragment>
          ))}
        </SortableContext>
      </SortableRows>
      {save.isError && (
        <Typography component="li" role="alert" variant="body2" color="error">
          {t('sidebar.failed')}
        </Typography>
      )}
      {creating && (
        <NewSectionDialog
          onClose={() => {
            setCreating(false)
          }}
        />
      )}
    </ListSection>
  )
}

/** A section, as a drag carries it. */
interface SectionDrag extends RowData {
  type: 'section'
  sectionId: string
}

/** A board or view of a section, as a drag carries it. */
interface EntryDrag extends RowData {
  type: 'entry'
  sectionId: string
  item: SidebarItem
  /** Its place among the items of its section. */
  index: number
  label: string
}

const isSection = (row: RowData): row is SectionDrag => row.type === 'section'
const isEntry = (row: RowData): row is EntryDrag => row.type === 'entry'

const typeOf = (container: { data: { current?: RowData | undefined } }) =>
  container.data.current?.type

// A section sorts among the sections. A board or view lands on the one it
// is over, else in the section it is over, even folded; the keyboard, with
// no pointer, takes the closest board or view.
const collisions: CollisionDetection = args => {
  if (args.active.data.current?.type === 'section') {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        container => typeOf(container) === 'section'
      )
    })
  }
  const hits = pointerWithin(args)
  const onEntries = hits.filter(hit => {
    const container = args.droppableContainers.find(each => each.id === hit.id)
    return container && typeOf(container) === 'entry'
  })
  if (onEntries.length > 0) return onEntries
  if (hits.length > 0) return hits
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      container => typeOf(container) === 'entry'
    )
  })
}

const entryId = (sectionId: string, item: SidebarItem) =>
  `${sectionId}|${item.kind}:${item.id}`

function SectionRow({
  section,
  name,
  shown
}: {
  section: SidebarSection
  name: string
  shown: Shown[]
}): ReactElement {
  const { t } = useI18n()
  const drag = useRowDrag()
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  const close = () => {
    setDialog(null)
  }
  // A board or view from another section would land in it.
  const landing =
    drag !== null &&
    isEntry(drag.active) &&
    drag.over?.sectionId === section.id &&
    drag.active.sectionId !== section.id

  return (
    <SortableRow
      id={section.id}
      data={{ type: 'section', sectionId: section.id } satisfies SectionDrag}
      description={t('drag.column')}
      highlighted={landing}
      open={open}
      onToggle={() => {
        setOpen(was => !was)
      }}
      icon={<Icon icon={section.favorites ? Star : Folder} />}
      text={
        <ListItemText
          primary={name}
          secondary={
            section.favorites
              ? t('settings.favoritesHint')
              : t('settings.items', { smart_count: shown.length })
          }
        />
      }
      actions={
        <>
          <RowAction
            icon={Pen}
            label={t('sidebar.renameSection', { name })}
            onClick={() => {
              setDialog('rename')
            }}
          />
          {/* Favorites stays, as the place of the favorites in no other. */}
          {section.favorites ? (
            <SubMenuActionGap disabled aria-hidden>
              <Icon icon={Trash} />
            </SubMenuActionGap>
          ) : (
            <RowAction
              icon={Trash}
              label={t('sidebar.deleteSection', { name })}
              onClick={() => {
                setDialog('delete')
              }}
            />
          )}
          {dialog === 'rename' && (
            <RenameSectionDialog
              section={section}
              name={name}
              onClose={close}
            />
          )}
          {dialog === 'delete' && (
            <DeleteSectionDialog
              section={section}
              name={name}
              onClose={close}
            />
          )}
        </>
      }
    >
      {shown.length === 0 && (
        <ListItem>
          <ListItemText secondary={t('settings.empty')} />
        </ListItem>
      )}
      <SortableContext
        items={shown.map(entry => entryId(section.id, entry.item))}
        strategy={verticalListSortingStrategy}
      >
        {shown.map(entry => (
          <SortableEntry
            key={entryId(section.id, entry.item)}
            id={entryId(section.id, entry.item)}
            data={
              {
                type: 'entry',
                sectionId: section.id,
                item: entry.item,
                index: entry.index,
                label: entry.label
              } satisfies EntryDrag
            }
            description={t('settings.dragEntry')}
          >
            <EntryLink entry={entry} />
          </SortableEntry>
        ))}
      </SortableContext>
    </SortableRow>
  )
}

// A row of a Twake list that is a link, which its types leave out.
const ListItemLink: ComponentType<
  ComponentProps<typeof ListItemButton> & { href: string }
> = ListItemButton

/** A board or view a section holds, a link to it. */
function EntryLink({ entry }: { entry: Shown }): ReactElement {
  const href = useHref(entry.to)
  const open = useLinkClickHandler<HTMLDivElement>(entry.to)
  return (
    <ListItemLink href={href} onClick={open}>
      <ListItemIcon>
        <Icon icon={entry.icon} />
      </ListItemIcon>
      <ListItemText primary={entry.label} />
    </ListItemLink>
  )
}

function RowAction({
  icon,
  label,
  disabled = false,
  onClick
}: {
  icon: ElementType
  label: string
  disabled?: boolean
  onClick: () => void
}): ReactElement {
  const button = (
    <IconButton aria-label={label} disabled={disabled} onClick={onClick}>
      <Icon icon={icon} />
    </IconButton>
  )
  // A disabled button has no events for its tooltip.
  return disabled ? (
    button
  ) : (
    <Tooltip disableInteractive title={label}>
      {button}
    </Tooltip>
  )
}

function NewSectionDialog({ onClose }: { onClose: () => void }): ReactElement {
  const { t } = useI18n()
  const create = useCreateSidebarSection()
  return (
    <SectionNameDialog
      title={t('settings.newSection')}
      submitLabel={t('sidebar.create')}
      pending={create.isPending}
      failed={create.isError}
      onClose={onClose}
      onSubmit={name => {
        create.mutate(name, { onSuccess: onClose })
      }}
    />
  )
}

function RenameSectionDialog({
  section,
  name,
  onClose
}: {
  section: SidebarSection
  name: string
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const rename = useRenameSidebarSection()
  return (
    <SectionNameDialog
      title={t('sidebar.renameTitle')}
      initial={name}
      submitLabel={t('sidebar.save')}
      pending={rename.isPending}
      failed={rename.isError}
      onClose={onClose}
      onSubmit={newName => {
        rename.mutate(
          { sectionId: section.id, name: newName },
          { onSuccess: onClose }
        )
      }}
    />
  )
}

function DeleteSectionDialog({
  section,
  name,
  onClose
}: {
  section: SidebarSection
  name: string
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const remove = useDeleteSidebarSection()
  const titleId = useId()
  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId}>
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
        <Button variant="text" onClick={onClose}>
          {t('sidebar.cancel')}
        </Button>
        <Button
          color="error"
          startIcon={<Icon icon={Trash} />}
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate(section.id, { onSuccess: onClose })
          }}
        >
          {t('sidebar.deleteConfirm')}
        </Button>
      </DialogActions>
    </Dialog>
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
