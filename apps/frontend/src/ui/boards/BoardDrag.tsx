import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type Modifier,
  type Over,
  type UniqueIdentifier
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { getEventCoordinates } from '@dnd-kit/utilities'
import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type TouchEvent as ReactTouchEvent
} from 'react'

import type { SectionMove, TaskMove } from '@/application/boards'
import { dropOn, enterLane, laneOf, type Lanes } from '@/application/boardDrag'
import { columnMove, reorder } from '@/application/columnDrag'
import { COLUMN } from '@/ds/Sortable'
import { moveInto } from '@/application/moveTask'
import { useI18n } from '@/ui/i18n/useI18n'

export interface Lane {
  key: string
  sectionId: string | null
  name: string
  taskIds: string[]
}

// `landed` keeps the dropped order on screen until the board data changes,
// so the card does not flash back to where it came from.
type Drag =
  | { phase: 'dragging'; id: string; start: Lanes; lanes: Lanes }
  | { phase: 'landed'; lanes: Lanes; shownOver: string }

// The same for a column: its new place shows until the sections change.
type ColumnDrag =
  | { phase: 'dragging'; id: string }
  | { phase: 'landed'; order: string[]; shownOver: string }

/** The sections a board admin can reorder, by dragging their header. */
export interface DraggableColumns {
  ids: string[]
  nameOf: (sectionId: string) => string
  onMove: (sectionId: string, move: SectionMove) => Promise<unknown>
  preview: (sectionId: string) => ReactNode
}

const SORT_PREFIX = 'column:'

/** A column's place among the sortable columns, apart from its cards' lane. */
export const columnSortId = (sectionId: string): string =>
  SORT_PREFIX + sectionId

const sectionOf = (id: UniqueIdentifier): string =>
  String(id).slice(SORT_PREFIX.length)

const isColumn = (item: Pick<Active, 'data'>): boolean =>
  item.data.current?.type === COLUMN

// A column lands among columns, on the one under the pointer, a card among
// cards and lanes.
const collisions: CollisionDetection = args => {
  const column = isColumn(args.active)
  const within = {
    ...args,
    droppableContainers: args.droppableContainers.filter(
      container => isColumn(container) === column
    )
  }
  if (!column) return closestCorners(within)
  const under = pointerWithin(within)
  return under.length > 0 ? under : closestCenter(within)
}

// The arrow keys move a column to the next column, not onto the first card
// of its own, which lies to its right too.
const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const { active, droppableContainers } = args.context
  if (!active || !isColumn(active)) {
    return sortableKeyboardCoordinates(event, args)
  }
  const columnsOnly = {
    getEnabled: () => droppableContainers.getEnabled().filter(isColumn),
    get: (id: UniqueIdentifier) => droppableContainers.get(id)
  } as typeof droppableContainers
  return sortableKeyboardCoordinates(event, {
    ...args,
    context: { ...args.context, droppableContainers: columnsOnly }
  })
}

// Selecting text in a field on the card must not pick the card up. Not
// `instanceof`: a panel opened from the card may be rendered in another
// document (the overlay of TwakeSpace), whose nodes are of another window.
const fromField = (event: Event): boolean => {
  const target = event.target as Element | null
  return (
    target?.nodeType === Node.ELEMENT_NODE &&
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  )
}

class CardMouseSensor extends MouseSensor {
  static override activators = [
    {
      eventName: 'onMouseDown' as const,
      handler: ({ nativeEvent }: ReactMouseEvent) =>
        nativeEvent.button === 0 && !fromField(nativeEvent)
    }
  ]
}

class CardTouchSensor extends TouchSensor {
  static override activators = [
    {
      eventName: 'onTouchStart' as const,
      handler: ({ nativeEvent }: ReactTouchEvent) =>
        nativeEvent.touches.length === 1 && !fromField(nativeEvent)
    }
  ]
}

// The preview follows the pointer from its corner, as Twake Drive shows a
// file being moved; a drag from the keyboard keeps it over the task. Near the
// right edge of the window, it moves left of the pointer to stay in view.
const POINTER_GAP = 8
export const atPointer: Modifier = ({
  activatorEvent,
  draggingNodeRect,
  windowRect,
  transform
}) => {
  const start = activatorEvent && getEventCoordinates(activatorEvent)
  if (!start || !draggingNodeRect) return transform
  const left = Math.min(
    start.x + transform.x + POINTER_GAP,
    (windowRect?.width ?? Infinity) - draggingNodeRect.width - POINTER_GAP
  )
  return {
    ...transform,
    x: left - draggingNodeRect.left,
    y: transform.y + start.y - draggingNodeRect.top + POINTER_GAP
  }
}

// A preview the size of the task keeps the place it was grabbed at, until
// it would leave the window. A task grabbed already past an edge stays where
// it was rather than jumping away from the pointer.
export const inWindow: Modifier = ({
  draggingNodeRect,
  windowRect,
  transform
}) => {
  if (!draggingNodeRect || !windowRect) return transform
  const start = draggingNodeRect.left
  const left = Math.max(
    Math.min(0, start),
    Math.min(
      start + transform.x,
      Math.max(windowRect.width - draggingNodeRect.width, start)
    )
  )
  return { ...transform, x: left - start }
}

const below = (active: Active, over: Over): boolean => {
  const top = active.rect.current.translated?.top
  return top !== undefined && top > over.rect.top + over.rect.height / 2
}

export function BoardDrag({
  lanes,
  titleOf,
  onMove,
  preview,
  previewAtPointer = false,
  columns,
  children
}: {
  lanes: Lane[]
  titleOf: (taskId: string) => string
  /** False refuses the drop, and the card goes back. */
  onMove: (taskId: string, move: TaskMove) => boolean | undefined
  preview: (taskId: string) => ReactNode
  /** The preview is smaller than the task, so it follows the pointer. */
  previewAtPointer?: boolean
  columns?: DraggableColumns | undefined
  /** `order` is the sections in the order to show them. */
  children: (idsOf: (laneKey: string) => string[], order: string[]) => ReactNode
}): ReactElement {
  const { t } = useI18n()
  const [drag, setDrag] = useState<Drag | null>(null)
  const [columnDrag, setColumnDrag] = useState<ColumnDrag | null>(null)
  const justPicked = useRef(false)
  const sectionIds = columns?.ids ?? []
  const sectionSignature = JSON.stringify(sectionIds)
  const order =
    columnDrag?.phase === 'landed' && columnDrag.shownOver === sectionSignature
      ? columnDrag.order
      : sectionIds
  const sensors = useSensors(
    useSensor(CardMouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(CardTouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 }
    }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates })
  )
  const settled: Lanes = Object.fromEntries(
    lanes.map(lane => [lane.key, lane.taskIds])
  )
  const signature = JSON.stringify(settled)
  const shown =
    drag?.phase === 'dragging' ||
    (drag?.phase === 'landed' && drag.shownOver === signature)
      ? drag.lanes
      : settled
  const task = (id: UniqueIdentifier) => titleOf(String(id))
  const place = (id: UniqueIdentifier) => {
    const key = laneOf(shown, String(id))
    return lanes.find(lane => lane.key === key)?.name ?? ''
  }
  const section = (id: UniqueIdentifier) => columns?.nameOf(sectionOf(id)) ?? ''
  const position = (id: UniqueIdentifier) => ({
    section: section(id),
    position: order.indexOf(sectionOf(id)) + 1,
    count: order.length
  })
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      justPicked.current = true
      return isColumn(active)
        ? t('drag.columnPicked', { section: section(active.id) })
        : t('drag.picked', { task: task(active.id) })
    },
    // dnd-kit reports a first "over" as soon as the item is picked up, before
    // any move. It would replace "Picked up" in the live region unread.
    onDragOver: ({ active, over }) => {
      const first = justPicked.current
      justPicked.current = false
      return !over || first
        ? undefined
        : isColumn(active)
          ? t('drag.columnOver', {
              ...position(over.id),
              section: section(active.id)
            })
          : t('drag.over', { task: task(active.id), place: place(over.id) })
    },
    onDragEnd: ({ active, over }) =>
      isColumn(active)
        ? over
          ? t('drag.columnDropped', {
              ...position(over.id),
              section: section(active.id)
            })
          : t('drag.columnCanceled', { section: section(active.id) })
        : over
          ? t('drag.dropped', { task: task(active.id), place: place(over.id) })
          : t('drag.canceled', { task: task(active.id) }),
    onDragCancel: ({ active }) =>
      isColumn(active)
        ? t('drag.columnCanceled', { section: section(active.id) })
        : t('drag.canceled', { task: task(active.id) })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisions}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t('drag.instructions') }
      }}
      onDragStart={({ active }) => {
        if (isColumn(active)) {
          setColumnDrag({ phase: 'dragging', id: sectionOf(active.id) })
          return
        }
        setDrag({
          phase: 'dragging',
          id: String(active.id),
          start: settled,
          lanes: settled
        })
      }}
      onDragOver={({ active, over }) => {
        if (!over || isColumn(active)) return
        setDrag(current =>
          current?.phase === 'dragging'
            ? {
                ...current,
                lanes: enterLane(
                  current.lanes,
                  String(active.id),
                  String(over.id),
                  below(active, over)
                )
              }
            : current
        )
      }}
      onDragEnd={({ active, over }) => {
        if (isColumn(active)) {
          const moved = sectionOf(active.id)
          const move = over
            ? columnMove(order, moved, sectionOf(over.id))
            : null
          if (!columns || !over || !move) {
            setColumnDrag(null)
            return
          }
          setColumnDrag({
            phase: 'landed',
            order: reorder(order, moved, sectionOf(over.id)),
            shownOver: sectionSignature
          })
          // A refused move leaves the sections as they were, so the dropped
          // order would otherwise stay on screen.
          columns.onMove(moved, move).catch(() => {
            setColumnDrag(null)
          })
          return
        }
        if (drag?.phase !== 'dragging' || !over) {
          setDrag(null)
          return
        }
        const landing = dropOn(
          drag.start,
          drag.lanes,
          String(active.id),
          String(over.id)
        )
        const lane = lanes.find(each => each.key === landing?.lane)
        if (!landing || !lane) {
          setDrag(null)
          return
        }
        const accepted = onMove(
          String(active.id),
          moveInto(lane.sectionId, landing.ids, landing.index)
        )
        setDrag(
          accepted === false
            ? null
            : { phase: 'landed', lanes: drag.lanes, shownOver: signature }
        )
      }}
      onDragCancel={() => {
        setDrag(null)
        setColumnDrag(null)
      }}
    >
      {children(key => shown[key] ?? [], order)}
      {/* A preview at the pointer would stretch on its way back to the
          task, so it just goes when dropped, as in Twake Drive. Its box
          fits the preview, not the task, for atPointer to measure it. */}
      <DragOverlay
        modifiers={[previewAtPointer ? atPointer : inWindow]}
        dropAnimation={previewAtPointer ? null : undefined}
        // eslint-disable-next-line no-restricted-syntax -- overrides the task's size dnd-kit sets inline
        style={previewAtPointer ? { width: 'fit-content', height: 'auto' } : {}}
      >
        {drag?.phase === 'dragging'
          ? preview(drag.id)
          : columnDrag?.phase === 'dragging'
            ? columns?.preview(columnDrag.id)
            : null}
      </DragOverlay>
    </DndContext>
  )
}
