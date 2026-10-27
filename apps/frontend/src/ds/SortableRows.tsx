import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Bottom, Burger, Icon, Right } from '@linagora/twake-icons'
import {
  Box,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon
} from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

/**
 * Rows a handle drags into another order, by the pointer or, from the
 * handle, by Space or Enter and the arrow keys.
 */
export function SortableRows({
  ids,
  announcements,
  instructions,
  onSort,
  children
}: {
  ids: string[]
  /** What a screen reader hears while a row moves. */
  announcements: Announcements
  instructions: string
  /** The ids in their new order, once a row is dropped elsewhere. */
  onSort: (ids: string[]) => void
  children: ReactNode
}): ReactElement {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: instructions }
      }}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return
        onSort(
          arrayMove(
            ids,
            ids.indexOf(String(active.id)),
            ids.indexOf(String(over.id))
          )
        )
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

/**
 * A row of SortableRows: its handle, then a button that unfolds what it
 * holds under it, as an accordion, and its actions at its end.
 */
export function SortableRow({
  id,
  handleLabel,
  description,
  open,
  onToggle,
  icon,
  text,
  actions,
  children
}: {
  id: string
  /** Names the handle, as Move and the row's name. */
  handleLabel: string
  /** What the handle is, as a sortable section. */
  description: string
  open: boolean
  onToggle: () => void
  icon: ReactNode
  text: ReactNode
  actions: ReactNode
  /** What it holds, as rows of a list. */
  children: ReactNode
}): ReactElement {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging
  } = useSortable({ id, attributes: { roleDescription: description } })

  return (
    <Box
      component="li"
      ref={setNodeRef}
      // eslint-disable-next-line no-restricted-syntax -- changes every frame of a drag; sx would mint a class per frame
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1
      }}
      sx={{
        position: 'relative',
        zIndex: isDragging ? 1 : 'auto',
        bgcolor: 'background.paper'
      }}
    >
      <List disablePadding>
        <ListItem disablePadding secondaryAction={actions}>
          <IconButton
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={handleLabel}
            size="small"
            sx={{ cursor: 'grab', touchAction: 'none', mx: 0.5 }}
          >
            <Icon icon={Burger} />
          </IconButton>
          <ListItemButton
            aria-expanded={open}
            onClick={onToggle}
            sx={{ borderRadius: 2, pl: 1 }}
          >
            <ListItemIcon sx={{ minWidth: 24 }}>
              <Icon icon={open ? Bottom : Right} size={12} />
            </ListItemIcon>
            <ListItemIcon>{icon}</ListItemIcon>
            {text}
          </ListItemButton>
        </ListItem>
        <Collapse in={open} unmountOnExit>
          <List disablePadding sx={{ pl: 12 }}>
            {children}
          </List>
        </Collapse>
      </List>
    </Box>
  )
}
