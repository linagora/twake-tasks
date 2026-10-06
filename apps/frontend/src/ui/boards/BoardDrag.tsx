import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type Over,
  type UniqueIdentifier
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import {
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type TouchEvent as ReactTouchEvent
} from 'react'

import type { TaskMove } from '@/application/boards'
import { dropOn, enterLane, laneOf, type Lanes } from '@/application/boardDrag'
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

const below = (active: Active, over: Over): boolean => {
  const top = active.rect.current.translated?.top
  return top !== undefined && top > over.rect.top + over.rect.height / 2
}

export function BoardDrag({
  lanes,
  titleOf,
  onMove,
  preview,
  children
}: {
  lanes: Lane[]
  titleOf: (taskId: string) => string
  onMove: (taskId: string, move: TaskMove) => void
  preview: (taskId: string) => ReactNode
  children: (idsOf: (laneKey: string) => string[]) => ReactNode
}): ReactElement {
  const { t } = useI18n()
  const [drag, setDrag] = useState<Drag | null>(null)
  const sensors = useSensors(
    useSensor(CardMouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(CardTouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
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
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('drag.picked', { task: task(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t('drag.over', { task: task(active.id), place: place(over.id) })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t('drag.dropped', { task: task(active.id), place: place(over.id) })
        : t('drag.canceled', { task: task(active.id) }),
    onDragCancel: ({ active }) => t('drag.canceled', { task: task(active.id) })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t('drag.instructions') }
      }}
      onDragStart={({ active }) => {
        setDrag({
          phase: 'dragging',
          id: String(active.id),
          start: settled,
          lanes: settled
        })
      }}
      onDragOver={({ active, over }) => {
        if (!over) return
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
        setDrag({ phase: 'landed', lanes: drag.lanes, shownOver: signature })
        onMove(
          String(active.id),
          moveInto(lane.sectionId, landing.ids, landing.index)
        )
      }}
      onDragCancel={() => {
        setDrag(null)
      }}
    >
      {children(key => shown[key] ?? [])}
      <DragOverlay>
        {drag?.phase === 'dragging' ? preview(drag.id) : null}
      </DragOverlay>
    </DndContext>
  )
}
