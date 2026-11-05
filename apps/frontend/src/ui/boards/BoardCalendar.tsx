import type { ReactElement } from 'react'

import { isEditable, type Board, type Task } from '@/domain/board'
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
  return (
    <CalendarLayout
      tasks={tasks}
      item={task => (
        <CalendarTask key={task.id} task={task} draggable={editable} />
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
