import { Link, Typography } from '@linagora/twake-mui'
import type { ComponentProps, ReactElement } from 'react'

import { BoardChip, LabelChip } from '@/ds/Columns'
import { ListRow } from '@/ds/ListView'
import { SortableListRow } from '@/ds/Sortable'
import type { Section, Task } from '@/domain/board'
import { CompleteCheckbox } from '@/ui/boards/CompleteCheckbox'
import { Assignees, DueChip, PriorityChip } from '@/ui/boards/TaskFacts'
import { useCompleteToggle } from '@/ui/boards/useCompleteToggle'
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
  boardId,
  sections,
  editable,
  sortable = false,
  boardName,
  parentTitle = null
}: {
  task: Task
  boardId: string
  sections: Section[]
  editable: boolean
  /** Dragged to another place of the list, as a card on a board. */
  sortable?: boolean
  /** Shown where the tasks of many boards meet. */
  boardName?: string
  /** A sub-task's parent, named where it shows without it. */
  parentTitle?: string | null
}): ReactElement {
  const { t } = useI18n()
  const panel = useTaskPanel(task.key)
  const completion = useCompleteToggle(task, boardId, sections, editable)
  const newTask = useNewTaskHighlight(task.key)

  return (
    <Row
      sortable={sortable}
      id={task.id}
      description={t('drag.card')}
      label={`${task.key} ${task.title}`}
      highlighted={newTask.isNew}
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
            newTask.clear()
            panel.show()
          }}
        >
          {task.title}
          {parentTitle !== null && (
            <Typography
              variant="caption"
              color="textSecondary"
              component="span"
              className="u-ml-half"
            >
              {t('agenda.subtaskOf', { title: parentTitle })}
            </Typography>
          )}
        </Link>
      }
      people={
        task.assignees.length > 0 && <Assignees people={task.assignees} />
      }
      due={<DueChip task={task} />}
      priority={
        task.priority !== null && <PriorityChip priority={task.priority} />
      }
      board={boardName ? <BoardChip name={boardName} /> : undefined}
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
