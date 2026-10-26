import { Link } from '@linagora/twake-mui'
import { useState, type ComponentProps, type ReactElement } from 'react'

import { LabelChip } from '@/ds/Columns'
import { ListRow, type CellEdit, type EditableCell } from '@/ds/ListView'
import { SortableListRow } from '@/ds/Sortable'
import type { Label, Person, Section, Task } from '@/domain/board'
import { AssignPicker } from '@/ui/boards/AssignPicker'
import { CompleteCheckbox } from '@/ui/boards/CompleteCheckbox'
import { DatesEditor } from '@/ui/boards/Dates'
import { LabelsPicker } from '@/ui/boards/LabelsPicker'
import { PriorityPicker } from '@/ui/boards/PriorityPicker'
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
  tasks,
  boardId,
  sections,
  members,
  labels,
  shareable,
  editable,
  sortable = false
}: {
  task: Task
  /** The board's tasks, whose assignees the people picker offers first. */
  tasks: Task[]
  boardId: string
  sections: Section[]
  members: Person[]
  labels: Label[]
  shareable: boolean
  editable: boolean
  /** Dragged to another place of the list, as a card on a board. */
  sortable?: boolean
}): ReactElement {
  const { t } = useI18n()
  const panel = useTaskPanel(task.key)
  const completion = useCompleteToggle(task, boardId, sections, editable)
  const newTask = useNewTaskHighlight(task.key)
  // The cell being edited, its picker under it, as in the task's panel.
  const [editing, setEditing] = useState<{
    cell: EditableCell
    anchor: HTMLElement
  } | null>(null)
  const stopEditing = () => {
    setEditing(null)
  }
  const edit = (cell: EditableCell, column: string): CellEdit => ({
    label: t('layout.editCell', { column, key: task.key }),
    onClick: anchor => {
      setEditing({ cell, anchor })
    }
  })
  const edits = editable
    ? {
        people: edit('people', t('task.assignees')),
        due: edit('due', t('layout.due')),
        priority: edit('priority', t('task.priority')),
        labels: edit('labels', t('task.labels'))
      }
    : undefined

  return (
    <>
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
          </Link>
        }
        people={
          task.assignees.length > 0 && <Assignees people={task.assignees} />
        }
        due={task.dueDate !== null && <DueChip task={task} />}
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
        edits={edits}
      />
      {editing?.cell === 'people' && (
        <AssignPicker
          task={task}
          boardId={boardId}
          members={members}
          tasks={tasks}
          shareable={shareable}
          anchor={editing.anchor}
          onClose={stopEditing}
        />
      )}
      {editing?.cell === 'due' && (
        <DatesEditor
          task={task}
          boardId={boardId}
          anchor={editing.anchor}
          onClose={stopEditing}
        />
      )}
      {editing?.cell === 'priority' && (
        <PriorityPicker
          task={task}
          boardId={boardId}
          anchor={editing.anchor}
          onClose={stopEditing}
        />
      )}
      {editing?.cell === 'labels' && (
        <LabelsPicker
          task={task}
          boardId={boardId}
          labels={labels}
          anchor={editing.anchor}
          onClose={stopEditing}
        />
      )}
    </>
  )
}
