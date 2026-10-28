import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier
} from '@dnd-kit/core'
import {
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode
} from 'react'

import { addDays } from '@/application/reschedule'
import { CalendarTray, DayButton, DayCell, type ChipDrag } from '@/ds/Calendar'
import { ListDragPreview } from '@/ds/ListView'
import type { Task } from '@/domain/board'
import { atPointer } from '@/ui/boards/BoardDrag'
import { localToday } from '@/ui/boards/dueLabel'
import { useI18n } from '@/ui/i18n/useI18n'

const TRAY = 'undated'
const DAY = 'day:'

const dayOf = (id: UniqueIdentifier): string | null =>
  String(id).startsWith(DAY) ? String(id).slice(DAY.length) : null

const STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7
}

/**
 * Tasks dragged between the days of the month and the tray of tasks without
 * a date. From the keyboard, the arrows move a day or a week, and crossing
 * out of the month shows the next or previous one.
 */
export function CalendarDrag({
  tasks,
  onMove,
  onShow,
  children
}: {
  tasks: Task[]
  onMove: (task: Task, day: string | null) => void
  /** The keyboard is on this day, which the calendar must show. */
  onShow: (day: string) => void
  children: ReactNode
}): ReactElement {
  const { t, lang } = useI18n()
  const [dragged, setDragged] = useState<Task | null>(null)
  // The day the keyboard is on. dnd-kit finds it by the item's place on
  // screen, which a month just shown has not measured yet.
  const keyboardDay = useRef<string | null>(null)
  const taskOf = (id: UniqueIdentifier) => tasks.find(task => task.id === id)

  const coordinateGetter: KeyboardCoordinateGetter = (
    event,
    { context, currentCoordinates }
  ) => {
    const step = STEPS[event.code]
    const from = context.active && taskOf(context.active.id)
    if (step === undefined || !from) return undefined
    const on = keyboardDay.current ?? from.dueDate
    const day = on === null ? localToday() : addDays(on, step)
    keyboardDay.current = day
    onShow(day)
    const target = context.droppableRects.get(DAY + day)
    const self = context.collisionRect
    return target && self
      ? {
          x: target.left + (target.width - self.width) / 2,
          y: target.top + (target.height - self.height) / 2
        }
      : currentCoordinates
  }

  const collisions: CollisionDetection = args => {
    const day = keyboardDay.current
    if (day === null) return pointerWithin(args)
    return args.droppableContainers.some(drop => drop.id === DAY + day)
      ? [{ id: DAY + day }]
      : []
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 }
    }),
    // Enter still opens the task, as a click does.
    useSensor(KeyboardSensor, {
      coordinateGetter,
      keyboardCodes: {
        start: ['Space'],
        cancel: ['Escape'],
        end: ['Space', 'Enter', 'Tab']
      }
    })
  )

  const longDate = new Intl.DateTimeFormat(lang, {
    dateStyle: 'full',
    timeZone: 'UTC'
  })
  const task = (id: UniqueIdentifier) => {
    const each = taskOf(id)
    return each ? `${each.key} ${each.title}` : ''
  }
  const place = (id: UniqueIdentifier) => {
    const day = dayOf(id)
    return day === null
      ? t('layout.noDate')
      : longDate.format(new Date(`${day}T00:00:00Z`))
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

  const stop = () => {
    keyboardDay.current = null
    setDragged(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisions}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t('drag.dayInstructions') }
      }}
      onDragStart={({ active }) => {
        keyboardDay.current = null
        setDragged(taskOf(active.id) ?? null)
      }}
      onDragEnd={({ active, over }) => {
        const moved = taskOf(active.id)
        stop()
        if (!moved || !over) return
        const day = dayOf(over.id)
        if (day !== moved.dueDate) onMove(moved, day)
      }}
      onDragCancel={({ active }) => {
        // Back to the task's day, which the keyboard may have left behind.
        const day = taskOf(active.id)?.dueDate
        if (keyboardDay.current !== null && day) onShow(day)
        stop()
      }}
    >
      {children}
      <DragOverlay
        modifiers={[atPointer]}
        dropAnimation={null}
        // eslint-disable-next-line no-restricted-syntax -- overrides the task's size dnd-kit sets inline
        style={{ width: 'fit-content', height: 'auto' }}
      >
        {dragged && (
          <ListDragPreview taskKey={dragged.key} title={dragged.title} />
        )}
      </DragOverlay>
    </DndContext>
  )
}

/** What a calendar task spreads on its chip to be dragged, unless disabled. */
export function useChipDrag(
  task: Task,
  enabled: boolean
): ChipDrag | undefined {
  const { t } = useI18n()
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: task.id,
    disabled: !enabled,
    attributes: { roleDescription: t('drag.card') }
  })
  return enabled
    ? { ...attributes, ...listeners, ref: setNodeRef, dragging: isDragging }
    : undefined
}

export function DropDayCell({
  day,
  ...props
}: ComponentProps<typeof DayCell> & { day: string }): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: DAY + day })
  return <DayCell {...props} ref={setNodeRef} highlighted={isOver} />
}

export function DropDayButton({
  day,
  ...props
}: ComponentProps<typeof DayButton> & { day: string }): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: DAY + day })
  return <DayButton {...props} ref={setNodeRef} highlighted={isOver} />
}

export function DropTray(
  props: ComponentProps<typeof CalendarTray>
): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: TRAY })
  return <CalendarTray {...props} ref={setNodeRef} highlighted={isOver} />
}
