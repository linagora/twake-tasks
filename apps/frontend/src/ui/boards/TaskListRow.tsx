import { Link } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import { LabelChip } from '@/ds/Columns'
import { ListRow } from '@/ds/ListView'
import type { Section, Task } from '@/domain/board'
import { CompleteCheckbox } from '@/ui/boards/CompleteCheckbox'
import { Assignees, DueChip, PriorityChip } from '@/ui/boards/TaskFacts'
import { useCompleteToggle } from '@/ui/boards/useCompleteToggle'
import { useTaskPanel } from '@/ui/boards/useTaskPanel'

export function TaskListRow({
  task,
  boardId,
  sections,
  editable
}: {
  task: Task
  boardId: string
  sections: Section[]
  editable: boolean
}): ReactElement {
  const panel = useTaskPanel(task.key)
  const completion = useCompleteToggle(task, boardId, sections, editable)

  return (
    <ListRow
      label={`${task.key} ${task.title}`}
      check={<CompleteCheckbox title={task.title} completion={completion} />}
      taskKey={task.key}
      done={completion.done}
      title={
        <Link
          component="button"
          variant="body2"
          color="inherit"
          underline="none"
          className="u-ta-left"
          onClick={() => {
            panel.show()
          }}
        >
          {task.title}
        </Link>
      }
      people={
        task.assignees.length > 0 && <Assignees people={task.assignees} />
      }
      due={<DueChip task={task} />}
      priority={
        task.priority !== null && <PriorityChip priority={task.priority} />
      }
      labels={task.labels.map(label => (
        <LabelChip key={label.id} name={label.name} color={label.color} />
      ))}
    />
  )
}
