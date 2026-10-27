import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type Modifier,
  type UniqueIdentifier
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Bottom, Icon, Right } from '@linagora/twake-icons'
import {
  Box,
  Collapse,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon
} from '@linagora/twake-mui'
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'

import { ListDragPreview } from '@/ds/ListView'

// A drag ends with a click on the row, which must not unfold it.
const JustDragged = createContext<() => boolean>(() => false)

/**
 * Rows dragged into another order as files in Twake Drive: the whole row
 * is picked up, its name follows the pointer on a sheet and the row it
 * leaves fades. From the keyboard, Space or Enter on the row picks it up
 * and the arrow keys move it.
 */
export function SortableRows({
  ids,
  nameOf,
  announcements,
  instructions,
  previewModifiers,
  onSort,
  children
}: {
  ids: string[]
  /** The name of a row, on the sheet under the pointer. */
  nameOf: (id: UniqueIdentifier) => string
  /** What a screen reader hears while a row moves. */
  announcements: Announcements
  instructions: string
  /** Where the sheet goes, as at the pointer. */
  previewModifiers: Modifier[]
  /** The ids in their new order, once a row is dropped elsewhere. */
  onSort: (ids: string[]) => void
  children: ReactNode
}): ReactElement {
  const [dragged, setDragged] = useState<UniqueIdentifier | null>(null)
  const endedAt = useRef(0)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 6 }
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
      onDragStart={({ active }) => {
        setDragged(active.id)
      }}
      onDragCancel={() => {
        setDragged(null)
      }}
      onDragEnd={({ active, over }) => {
        setDragged(null)
        endedAt.current = Date.now()
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
      <JustDragged value={() => Date.now() - endedAt.current < 300}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      </JustDragged>
      <DragOverlay
        modifiers={previewModifiers}
        dropAnimation={null}
        // eslint-disable-next-line no-restricted-syntax -- overrides the row's size dnd-kit sets inline
        style={{ width: 'fit-content', height: 'auto' }}
      >
        {dragged !== null && <ListDragPreview title={nameOf(dragged)} />}
      </DragOverlay>
    </DndContext>
  )
}

/**
 * A row of SortableRows: a button that unfolds what it holds under it, as
 * an accordion, and its actions at its end.
 */
export function SortableRow({
  id,
  description,
  open,
  onToggle,
  icon,
  text,
  actions,
  children
}: {
  id: string
  /** What the row is, as a sortable section. */
  description: string
  open: boolean
  onToggle: () => void
  icon: ReactNode
  text: ReactNode
  actions: ReactNode
  /** What it holds, as rows of a list. */
  children: ReactNode
}): ReactElement {
  const justDragged = useContext(JustDragged)
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
    isSorting
  } = useSortable({
    id,
    attributes: { role: 'listitem', roleDescription: description },
    // The rows stand where they were dropped, as in Twake Drive; sliding
    // them back would start from a place they have already left.
    animateLayoutChanges: () => false
  })

  return (
    <Box
      component="li"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClickCapture={event => {
        if (justDragged()) event.preventDefault()
      }}
      // eslint-disable-next-line no-restricted-syntax -- changes every frame of a drag; sx would mint a class per frame
      style={{
        transform: CSS.Translate.toString(transform),
        transition: isSorting ? transition : undefined,
        opacity: isDragging ? 0.5 : 1
      }}
      sx={{
        borderRadius: 2,
        touchAction: 'manipulation',
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main'
        }
      }}
    >
      <List disablePadding>
        <ListItem disablePadding secondaryAction={actions}>
          <ListItemButton
            aria-expanded={open}
            onClick={event => {
              if (!event.defaultPrevented) onToggle()
            }}
            sx={{ borderRadius: 2 }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              <Icon icon={open ? Bottom : Right} size={12} />
            </ListItemIcon>
            <ListItemIcon>{icon}</ListItemIcon>
            {text}
          </ListItemButton>
        </ListItem>
        <Collapse in={open} unmountOnExit>
          <List disablePadding sx={{ pl: 7 }}>
            {children}
          </List>
        </Collapse>
      </List>
    </Box>
  )
}
