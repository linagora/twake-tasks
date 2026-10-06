import { useState, type ReactElement } from 'react'
import { useSearchParams } from 'react-router'

import { CalendarChip } from '@/ds/Calendar'
import type { Task } from '@/domain/board'
import { TaskPanel } from '@/ui/boards/TaskPanel'

export function CalendarTask({
  task,
  boardId,
  editable
}: {
  task: Task
  boardId: string
  editable: boolean
}): ReactElement {
  const [params] = useSearchParams()
  const [open, setOpen] = useState(params.get('task') === task.key)

  return (
    <li>
      <CalendarChip
        done={task.completedAt !== null}
        onClick={() => {
          setOpen(true)
        }}
      >
        {task.title}
      </CalendarChip>
      {open && (
        <TaskPanel
          task={task}
          boardId={boardId}
          editable={editable}
          depth={1}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </li>
  )
}
