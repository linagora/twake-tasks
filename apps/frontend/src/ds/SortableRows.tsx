import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type Modifier
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
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
  useState,
  type ReactElement,
  type ReactNode
} from 'react'

import { ListDragPreview } from '@/ds/ListView'

/** What a row says of itself to a drag, as dnd-kit carries it. */
export type RowData = Record<string, unknown>

interface Dragging {
  active: RowData
  over: RowData | null
}

// What is dragged and what it is over, for the rows to show where it lands.
const DragState = createContext<Dragging | null>(null)

/** What is dragged and what it is over, while a row of SortableRows is. */
export function useRowDrag(): Dragging | null {
  return useContext(DragState)
}

/**
 * Rows dragged into another order as files in Twake Drive: the whole row
 * is picked up, its name follows the pointer on a sheet and the row it
 * leaves fades. From the keyboard, Space or Enter on the row picks it up
 * and the arrow keys move it. The rows put themselves in SortableContexts.
 */
export function SortableRows({
  collisionDetection,
  announcements,
  instructions,
  previewModifiers,
  nameOf,
  onDrop,
  children
}: {
  collisionDetection: CollisionDetection
  /** What a screen reader hears while a row moves. */
  announcements: Announcements
  instructions: string
  /** Where the sheet goes, as at the pointer. */
  previewModifiers: Modifier[]
  /** The name of the row dragged, on the sheet under the pointer. */
  nameOf: (row: RowData) => string
  onDrop: (active: RowData, over: RowData) => void
  children: ReactNode
}): ReactElement {
  const [drag, setDrag] = useState<Dragging | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 6 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )
  const dataOf = (data: { current?: RowData | undefined } | undefined) =>
    data?.current ?? null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: instructions }
      }}
      onDragStart={({ active }) => {
        const data = dataOf(active.data)
        setDrag(data && { active: data, over: null })
      }}
      onDragOver={({ active, over }) => {
        const data = dataOf(active.data)
        setDrag(data && { active: data, over: dataOf(over?.data) })
      }}
      onDragCancel={() => {
        setDrag(null)
        swallowNextClick()
      }}
      onDragEnd={({ active, over }) => {
        setDrag(null)
        swallowNextClick()
        const from = dataOf(active.data)
        const to = dataOf(over?.data)
        if (from && to && active.id !== over?.id) onDrop(from, to)
      }}
    >
      <DragState value={drag}>{children}</DragState>
      <DragOverlay
        modifiers={previewModifiers}
        dropAnimation={null}
        // eslint-disable-next-line no-restricted-syntax -- overrides the row's size dnd-kit sets inline
        style={{ width: 'fit-content', height: 'auto' }}
      >
        {drag && <ListDragPreview title={nameOf(drag.active)} />}
      </DragOverlay>
    </DndContext>
  )
}

/**
 * A drag ends with a click on the row it ends over, which must neither
 * unfold it nor follow its link. dnd-kit stops it before the app sees it,
 * but leaves a link to the browser, which would load its page.
 */
function swallowNextClick() {
  const swallow = (event: Event) => {
    event.preventDefault()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => {
    window.removeEventListener('click', swallow, { capture: true })
  }, 300)
}

// The row a drag picks up, faded while it is dragged, as in Twake Drive.
function useSortableRow(id: string, data: RowData, description: string) {
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
    data,
    attributes: { role: 'listitem', roleDescription: description },
    // The rows stand where they were dropped, as in Twake Drive; sliding
    // them back would start from a place they have already left.
    animateLayoutChanges: () => false
  })
  return {
    ref: setNodeRef,
    ...attributes,
    ...listeners,
    style: {
      transform: CSS.Translate.toString(transform),
      transition: isSorting ? transition : undefined,
      opacity: isDragging ? 0.5 : 1
    }
  }
}

const rowSx = {
  borderRadius: 2,
  touchAction: 'manipulation',
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' }
}

/**
 * A row of SortableRows: a button that unfolds what it holds under it, as
 * an accordion, and its actions at its end. Tinted while what is dragged
 * would land in it.
 */
export function SortableRow({
  id,
  data,
  description,
  highlighted,
  open,
  onToggle,
  icon,
  text,
  actions,
  children
}: {
  id: string
  data: RowData
  /** What the row is, as a sortable section. */
  description: string
  highlighted: boolean
  open: boolean
  onToggle: () => void
  icon: ReactNode
  text: ReactNode
  actions: ReactNode
  /** What it holds, as SortableEntry rows. */
  children: ReactNode
}): ReactElement {
  const { style, ...row } = useSortableRow(id, data, description)
  return (
    <Box
      component="li"
      {...row}
      // eslint-disable-next-line no-restricted-syntax -- changes every frame of a drag; sx would mint a class per frame
      style={style}
      sx={theme => ({
        ...rowSx,
        bgcolor: highlighted
          ? theme.alpha(theme.vars.palette.primary.main, 0.08)
          : 'transparent',
        transition: 'background-color 120ms'
      })}
    >
      <List disablePadding>
        <ListItem disablePadding secondaryAction={actions}>
          <ListItemButton
            aria-expanded={open}
            onClick={onToggle}
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

/** A row under a SortableRow, dragged within it or into another. */
export function SortableEntry({
  id,
  data,
  description,
  children
}: {
  id: string
  data: RowData
  /** What the row is, as a sortable board. */
  description: string
  children: ReactNode
}): ReactElement {
  const { style, ...row } = useSortableRow(id, data, description)
  return (
    <Box
      component="li"
      {...row}
      // eslint-disable-next-line no-restricted-syntax -- changes every frame of a drag; sx would mint a class per frame
      style={style}
      sx={rowSx}
    >
      {children}
    </Box>
  )
}
