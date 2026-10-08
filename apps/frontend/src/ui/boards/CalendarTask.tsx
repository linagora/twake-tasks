import type { ReactElement } from 'react'

import { CalendarChip } from '@/ds/Calendar'
import type { Task } from '@/domain/board'
import { TaskPanel } from '@/ui/boards/TaskPanel'
import { useTaskPanel } from '@/ui/boards/useTaskPanel'

export function CalendarTask({
  task,
  boardId,
  editable
}: {
  task: Task
  boardId: string
  editable: boolean
}): ReactElement {
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
      {panel.open && (
        <TaskPanel
          task={task}
          boardId={boardId}
          editable={editable}
          depth={1}
          onClose={() => {
            panel.close()
          }}
        />
      )}
    </li>
  )
}
