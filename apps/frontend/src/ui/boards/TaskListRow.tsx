import { Link } from '@linagora/twake-mui'
import type { ComponentProps, ReactElement } from 'react'

import { LabelChip } from '@/ds/Columns'
import { ListRow } from '@/ds/ListView'
import { SortableListRow } from '@/ds/Sortable'
import { isDone, type Section, type Task } from '@/domain/board'
import { Assignees, DueChip, PriorityChip } from '@/ui/boards/TaskFacts'
import { useTaskPanel } from '@/ui/boards/useTaskPanel'
import { useI18n } from '@/ui/i18n/useI18n'
import { useNewTaskHighlight } from '@/ui/shell/NewTaskHighlight'

// Sortable where the list can be reordered, as the cards of a board.
function Row({
  sortable,
  id,
  description,
  ...props
}: ComponentProps<typeof ListRow> & {
  sortable: boolean
  id: string
  description: string
}): ReactElement {
  return sortable ? (
    <SortableListRow id={id} description={description} {...props} />
  ) : (
    <ListRow {...props} />
  )
}

export function TaskListRow({
  task,
  sections,
  sortable = false
}: {
  task: Task
  sections: Section[]
  /** Dragged to another place of the list, as a card on a board. */
  sortable?: boolean
}): ReactElement {
  const { t } = useI18n()
  const panel = useTaskPanel(task.key)
  const newTask = useNewTaskHighlight(task.key)

  return (
    <Row
      sortable={sortable}
      id={task.id}
      description={t('drag.card')}
      label={`${task.key} ${task.title}`}
      highlighted={newTask.isNew}
      taskKey={task.key}
      done={isDone(task, sections)}
      title={
        <Link
          component="button"
          variant="body2"
          color="inherit"
          underline="none"
          className="u-ta-left"
          onClick={() => {
            newTask.clear()
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
      labels={task.labels.map(label => ({
        key: label.id,
        name: label.name,
        chip: <LabelChip name={label.name} color={label.color} />
      }))}
      moreLabels={(count, names) =>
        t('board.moreLabels', { smart_count: count, names })
      }
    />
  )
}
