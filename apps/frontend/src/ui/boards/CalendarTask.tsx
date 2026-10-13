import type { ReactElement } from 'react'

import { CalendarChip } from '@/ds/Calendar'
import type { Task } from '@/domain/board'
import { useTaskPanel } from '@/ui/boards/useTaskPanel'

export function CalendarTask({ task }: { task: Task }): ReactElement {
  const panel = useTaskPanel(task.key)

  return (
    <li>
      <CalendarChip
        done={task.completedAt !== null}
        onClick={() => {
          panel.show()
        }}
      >
        {task.title}
      </CalendarChip>
    </li>
  )
}
