import { Checkbox, Link } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import { Checklist } from '@/ds/Columns'
import type { Task } from '@/domain/board'
import { useBoardChange } from '@/ui/boards/queries'
import { TaskPanel } from '@/ui/boards/TaskPanel'

export function Subtasks({
  parentId,
  tasks,
  boardId,
  editable,
  depth
}: {
  parentId: string
  tasks: Task[]
  boardId: string
  editable: boolean
  depth: number
}): ReactElement | null {
  const children = tasks.filter(task => task.parentId === parentId)
  if (children.length === 0) return null
  return (
    <Checklist>
      {children.map(task => (
        <Subtask
          key={task.id}
          task={task}
          tasks={tasks}
          boardId={boardId}
          editable={editable}
          depth={depth}
        />
      ))}
    </Checklist>
  )
}

function Subtask({
  task,
  tasks,
  boardId,
  editable,
  depth
}: {
  task: Task
  tasks: Task[]
  boardId: string
  editable: boolean
  depth: number
}): ReactElement {
  const [open, setOpen] = useState(false)
  const complete = useBoardChange(boardId, (api, done: boolean) =>
    api.completeTask(boardId, task.id, done ? 'completed' : null)
  )

  return (
    <li>
      <Checkbox
        size="small"
        checked={task.completedAt !== null}
        disabled={!editable || task.canceledAt !== null || complete.isPending}
        slotProps={{ input: { 'aria-label': task.title } }}
        onChange={event => {
          complete.mutate(event.target.checked)
        }}
      />
      <Link
        component="button"
        variant="body2"
        color="textPrimary"
        underline="hover"
        className="u-ta-left"
        onClick={() => {
          setOpen(true)
        }}
      >
        {task.title}
      </Link>
      {open && (
        <TaskPanel
          task={task}
          boardId={boardId}
          editable={editable}
          depth={depth}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
      <Subtasks
        parentId={task.id}
        tasks={tasks}
        boardId={boardId}
        editable={editable}
        depth={depth + 1}
      />
    </li>
  )
}
