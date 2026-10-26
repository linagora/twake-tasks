import { Link } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import { Checklist } from '@/ds/Columns'
import type { Task } from '@/domain/board'
import { useTaskPanel } from '@/ui/boards/useTaskPanel'

export function Subtasks({
  parentId,
  tasks,
  boardId,
  editable,
  label
}: {
  parentId: string
  tasks: Task[]
  boardId: string
  editable: boolean
  label?: string
}): ReactElement | null {
  const children = tasks.filter(task => task.parentId === parentId)
  if (children.length === 0) return null
  return (
    <Checklist {...(label ? { label } : {})}>
      {children.map(task => (
        <Subtask
          key={task.id}
          task={task}
          tasks={tasks}
          boardId={boardId}
          editable={editable}
        />
      ))}
    </Checklist>
  )
}

function Subtask({
  task,
  tasks,
  boardId,
  editable
}: {
  task: Task
  tasks: Task[]
  boardId: string
  editable: boolean
}): ReactElement {
  const panel = useTaskPanel(task.key, tasks)

  return (
    <li>
      <Link
        component="button"
        variant="body2"
        color="textPrimary"
        underline="hover"
        className="u-ta-left"
        onClick={panel.show}
      >
        {task.completedAt === null ? task.title : <del>{task.title}</del>}
      </Link>
      <Subtasks
        parentId={task.id}
        tasks={tasks}
        boardId={boardId}
        editable={editable}
      />
    </li>
  )
}
