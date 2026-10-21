import { Link } from '@linagora/twake-mui'
import type { ComponentProps, ReactElement } from 'react'

import { LabelChip } from '@/ds/Columns'
import { ListRow } from '@/ds/ListView'
import { SortableListRow } from '@/ds/Sortable'
import type { Section, Task } from '@/domain/board'
import { CompleteCheckbox } from '@/ui/boards/CompleteCheckbox'
import { Assignees, DueChip, PriorityChip } from '@/ui/boards/TaskFacts'
import { useCompleteToggle } from '@/ui/boards/useCompleteToggle'
import { useTaskPanel } from '@/ui/boards/useTaskPanel'
import { useI18n } from '@/ui/i18n/useI18n'

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
  boardId,
  sections,
  editable,
  sortable = false
}: {
  task: Task
  boardId: string
  sections: Section[]
  editable: boolean
  /** Dragged to another place of the list, as a card on a board. */
  sortable?: boolean
}): ReactElement {
  const { t } = useI18n()
  const panel = useTaskPanel(task.key)
  const completion = useCompleteToggle(task, boardId, sections, editable)

  return (
    <Row
      sortable={sortable}
      id={task.id}
      description={t('drag.card')}
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
