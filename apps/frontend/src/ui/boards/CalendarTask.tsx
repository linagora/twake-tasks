import type { ReactElement } from 'react'

import { CalendarChip } from '@/ds/Calendar'
import type { Task } from '@/domain/board'
import { useChipDrag } from '@/ui/boards/CalendarDrag'
import { timeLabel } from '@/ui/boards/dueLabel'
import { useTaskPanel } from '@/ui/boards/useTaskPanel'
import { useNewTaskHighlight } from '@/ui/shell/NewTaskHighlight'

export function CalendarTask({
  task,
  draggable = false,
  showTime = false
}: {
  task: Task
  draggable?: boolean
  showTime?: boolean
}): ReactElement {
  const panel = useTaskPanel(task.key)
  const newTask = useNewTaskHighlight(task.key)
  const drag = useChipDrag(task, draggable)

  return (
    <li>
      <CalendarChip
        done={task.completedAt !== null}
        time={showTime ? timeLabel(task) : null}
        highlighted={newTask.isNew}
        drag={drag}
        onClick={() => {
          newTask.clear()
          panel.show()
        }}
      >
        {task.title}
      </CalendarChip>
    </li>
  )
}
