import type { ReactElement } from 'react'

import { CalendarChip } from '@/ds/Calendar'
import type { Task } from '@/domain/board'
import { useTaskPanel } from '@/ui/boards/useTaskPanel'
import { useNewTaskHighlight } from '@/ui/shell/NewTaskHighlight'

export function CalendarTask({ task }: { task: Task }): ReactElement {
  const panel = useTaskPanel(task.key)
  const newTask = useNewTaskHighlight(task.key)

  return (
    <li>
      <CalendarChip
        done={task.completedAt !== null}
        highlighted={newTask.isNew}
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
