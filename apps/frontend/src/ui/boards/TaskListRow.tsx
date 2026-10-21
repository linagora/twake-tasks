import { Checkbox, Link, Typography } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import { shownLabels } from '@/application/hiddenFacts'
import { BoardChip, LabelChip } from '@/ds/Columns'
import { ListRow } from '@/ds/ListView'
import type { Section, Task } from '@/domain/board'
import { useHiddenFacts } from '@/ui/boards/HiddenFacts'
import { useBoardChange, useMoveTask } from '@/ui/boards/queries'
import { Assignees, DueChip, PriorityChip } from '@/ui/boards/TaskFacts'
import { useTaskPanel } from '@/ui/boards/useTaskPanel'
import { useI18n } from '@/ui/i18n/useI18n'

// A task in a section is done by being in a completed section, so ticking
// it moves it there; a task outside sections is completed in place.
export function TaskListRow({
  task,
  boardId,
  sections,
  editable,
  boardName,
  parentTitle = null
}: {
  task: Task
  boardId: string
  sections: Section[]
  editable: boolean
  /** Shown where the tasks of many boards meet. */
  boardName?: string
  /** A sub-task's parent, named where it shows without it. */
  parentTitle?: string | null
}): ReactElement {
  const { t } = useI18n()
  const panel = useTaskPanel(task.key)
  const hidden = useHiddenFacts()
  const complete = useBoardChange(boardId, (api, done: boolean) =>
    api.completeTask(boardId, task.id, done ? 'completed' : null)
  )
  const move = useMoveTask(boardId)
  const section = sections.find(each => each.id === task.sectionId)
  const doneSection = sections.find(each => each.category === 'completed')
  const openSection = sections.find(each => each.category === 'unstarted')
  const done = section
    ? section.category === 'completed'
    : task.completedAt !== null
  const target = section && (done ? openSection : doneSection)
  const toggle = (checked: boolean) => {
    if (!section) complete.mutate(checked)
    else if (target) {
      move.mutate({ taskId: task.id, move: { sectionId: target.id } })
    }
  }

  return (
    <ListRow
      label={`${task.key} ${task.title}`}
      check={
        <Checkbox
          size="small"
          checked={done}
          disabled={
            !editable ||
            task.canceledAt !== null ||
            (section ? !target || move.isPending : complete.isPending)
          }
          slotProps={{
            input: {
              'aria-label': t('layout.complete', { title: task.title })
            }
          }}
          onChange={event => {
            toggle(event.target.checked)
          }}
        />
      }
      taskKey={task.key}
      done={done}
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
        task.assignees.length > 0 &&
        !hidden.assignees && <Assignees people={task.assignees} />
      }
      due={!hidden.due && <DueChip task={task} />}
      priority={
        task.priority !== null &&
        !hidden.priority && <PriorityChip priority={task.priority} />
      }
      board={
        boardName && !hidden.board ? <BoardChip name={boardName} /> : undefined
      }
      labels={shownLabels(task.labels, hidden).map(label => (
        <LabelChip key={label.id} name={label.name} color={label.color} />
      ))}
    />
  )
}
