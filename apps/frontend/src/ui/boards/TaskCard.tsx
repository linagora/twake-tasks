import { Button, IconButton, Link } from '@linagora/twake-mui'
import { CheckList, Comment, Dots } from '@linagora/twake-icons'
import { memo, useState, type KeyboardEvent, type ReactElement } from 'react'

import {
  Card,
  CardTitle,
  LabelChip,
  Meta,
  MetaChip,
  SelectableKey
} from '@/ds/Columns'
import { Icon } from '@/ds/Icon'
import { SortableCard } from '@/ds/Sortable'
import { isDone } from '@/domain/board'
import { BoardTasks, CardMenu, type CardContext } from '@/ui/boards/CardMenu'
import { useKeySelect, usePickByClick } from '@/ui/boards/Selection'
import { Subtasks } from '@/ui/boards/Subtasks'
import {
  Assignees,
  BlockedChip,
  DueChip,
  PriorityChip
} from '@/ui/boards/TaskFacts'
import { useTaskPanel } from '@/ui/boards/useTaskPanel'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSubtasks } from '@/ui/queries/boards'
import { useNewTaskHighlight } from '@/ui/shell/NewTaskHighlight'

// Memoised: a board renders hundreds of cards, and a change of one task
// renders only its own card.
export const TaskCard = memo(function TaskCard({
  sortable = false,
  ...context
}: CardContext & {
  sortable?: boolean
  /** Unread: a new day renders the card again, so its due date turns overdue. */
  today: string
}): ReactElement {
  const { task, boardId, sections, onMove } = context
  const { t } = useI18n()
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [assigning, setAssigning] = useState<HTMLElement | null>(null)
  // A board mounts every card: the menu and its hooks wait for a first use,
  // then stay for the toasts that outlive it.
  const [used, setUsed] = useState(false)
  const panel = useTaskPanel(task.key)
  const newTask = useNewTaskHighlight(task.key)
  const select = useKeySelect(task)
  const pickByClick = usePickByClick(task)
  const editable = onMove !== undefined
  const taskDone = isDone(task, sections)
  const [showSubtasks, setShowSubtasks] = useState(false)
  const subtasks = useSubtasks(boardId, task.id)
  const done = subtasks.filter(each => each.completedAt !== null).length
  const blocked = task.blockers.length > 0 && !taskDone
  const facts =
    blocked ||
    task.priority !== null ||
    task.dueDate !== null ||
    subtasks.length > 0 ||
    task.commentCount > 0

  const body = (
    <>
      <Meta>
        <SelectableKey taskKey={task.key} select={select} />
        {task.labels.map(label => (
          <LabelChip key={label.id} name={label.name} color={label.color} />
        ))}
      </Meta>
      <CardTitle done={taskDone}>
        <Link
          component="button"
          variant="body2"
          color={taskDone ? 'textSecondary' : 'textPrimary'}
          underline={taskDone ? 'none' : 'hover'}
          className="u-ta-left"
          onClick={event => {
            if (pickByClick(event)) return
            newTask.clear()
            panel.show()
          }}
        >
          {task.title}
        </Link>
      </CardTitle>
      {(facts || task.assignees.length > 0) && (
        <Meta>
          {blocked && <BlockedChip task={task} />}
          {task.priority !== null && <PriorityChip priority={task.priority} />}
          <DueChip task={task} />
          {subtasks.length > 0 && (
            <Button
              variant="text"
              size="small"
              color={done === subtasks.length ? 'success' : 'inherit'}
              startIcon={<Icon icon={CheckList} size={12} />}
              aria-expanded={showSubtasks}
              aria-label={t('board.subtaskProgress', {
                done,
                total: subtasks.length
              })}
              onClick={() => {
                setShowSubtasks(shown => !shown)
              }}
              className="u-miw-auto u-ph-half"
            >
              {`${String(done)}/${String(subtasks.length)}`}
            </Button>
          )}
          {task.commentCount > 0 && (
            <MetaChip
              icon={<Icon icon={Comment} />}
              label={t('board.comments', { smart_count: task.commentCount })}
            >
              {task.commentCount}
            </MetaChip>
          )}
          {task.assignees.length > 0 && <Assignees people={task.assignees} />}
        </Meta>
      )}
      {showSubtasks && (
        <BoardTasks boardId={boardId}>
          {tasks => (
            <Subtasks
              parentId={task.id}
              tasks={tasks}
              boardId={boardId}
              editable={editable}
            />
          )}
        </BoardTasks>
      )}
    </>
  )
  const frame = {
    label: `${task.key} ${task.title}`,
    highlighted: newTask.isNew,
    selected: select?.checked ?? false,
    menu: onMove && (
      <IconButton
        size="small"
        aria-label={t('board.options', { key: task.key })}
        aria-haspopup="menu"
        aria-expanded={menuAnchor !== null}
        onClick={event => {
          setUsed(true)
          setMenuAnchor(event.currentTarget)
        }}
      >
        <Icon icon={Dots} />
      </IconButton>
    ),
    onKeyDownCapture: (event: KeyboardEvent<HTMLElement>) => {
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey
      if (
        editable &&
        plain &&
        event.key === 'a' &&
        event.target === event.currentTarget
      ) {
        event.preventDefault()
        setUsed(true)
        setAssigning(event.currentTarget)
      }
    }
  }

  // Portalled panels sit outside the card: React bubbles their pointer events
  // through the tree, and they must not start a drag.
  return (
    <>
      {sortable ? (
        <SortableCard id={task.id} description={t('drag.card')} {...frame}>
          {body}
        </SortableCard>
      ) : (
        <Card {...frame}>{body}</Card>
      )}
      {used && (
        <CardMenu
          {...context}
          select={select}
          menuAnchor={menuAnchor}
          setMenuAnchor={setMenuAnchor}
          assigning={assigning}
          setAssigning={setAssigning}
        />
      )}
    </>
  )
})
