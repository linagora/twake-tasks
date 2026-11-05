import type { ReactElement } from 'react'

import { isEditable, type Board, type Task } from '@/domain/board'
import { useCalendarPeriod } from '@/ui/boards/calendarPeriod'
import { CalendarTask } from '@/ui/boards/CalendarTask'
import { CalendarLayout } from '@/ui/boards/Layouts'
import { useReschedule } from '@/ui/boards/useReschedule'
import { useNewTaskParam } from '@/ui/shell/useNewTaskParam'

export function BoardCalendar({
  board,
  tasks
}: {
  board: Board
  tasks: Task[]
}): ReactElement {
  const editable = isEditable(board)
  const reschedule = useReschedule(board.id)
  const { openNewTask } = useNewTaskParam()
  const { period, setPeriod } = useCalendarPeriod(board.id)
  return (
    <CalendarLayout
      tasks={tasks}
      period={period}
      onPeriod={setPeriod}
      item={(task, showTime) => (
        <CalendarTask
          key={task.id}
          task={task}
          draggable={editable}
          showTime={showTime}
        />
      )}
      onAdd={
        editable
          ? dueDate => {
              openNewTask({ dueDate: dueDate ?? undefined })
            }
          : undefined
      }
      onMove={
        editable
          ? (task, day) => {
              reschedule.mutate({ task, day })
            }
          : undefined
      }
    />
  )
}
