import {
  Alert,
  Button,
  Divider,
  IconButton,
  Link,
  Menu,
  Typography
} from '@linagora/twake-mui'
import {
  Archive,
  CalendarToday,
  CheckList,
  Comment,
  Dots,
  FolderMoveto,
  Icon,
  Label as LabelIcon,
  Link as LinkIcon,
  Moveto,
  PersonAdd,
  Trash
} from '@linagora/twake-icons'
import { useState, type KeyboardEvent, type ReactElement } from 'react'

import {
  BoardChip,
  Card,
  CardCheck,
  CardTitle,
  LabelChip,
  Meta,
  MetaChip
} from '@/ds/Columns'
import { IconMenuItem } from '@/ds/IconMenuItem'
import { SortableCard } from '@/ds/Sortable'
import { Toast } from '@/ds/Toast'
import type { Label, Person, Section, Task } from '@/domain/board'
import { useRemoveTask } from '@/ui/boards/Archive'
import { AssignPicker } from '@/ui/boards/AssignPicker'
import { CompleteCheckbox } from '@/ui/boards/CompleteCheckbox'
import { useCopyLink } from '@/ui/boards/CopyLink'
import { DatesEditor } from '@/ui/boards/Dates'
import { LabelsPicker } from '@/ui/boards/LabelsPicker'
import { Subtasks } from '@/ui/boards/Subtasks'
import { Assignees, DueChip, PriorityChip } from '@/ui/boards/TaskFacts'
import { TransferDialog, useTransferable } from '@/ui/boards/TransferTask'
import { useCompleteToggle } from '@/ui/boards/useCompleteToggle'
import { useTaskPanel } from '@/ui/boards/useTaskPanel'
import { useI18n } from '@/ui/i18n/useI18n'
import { useNewTaskHighlight } from '@/ui/shell/NewTaskHighlight'

export function TaskCard({
  task,
  tasks,
  boardId,
  members,
  shareable,
  labels,
  sections,
  destinations,
  onMove,
  sortable = false,
  boardName,
  parentTitle = null
}: {
  task: Task
  tasks: Task[]
  boardId: string
  members: Person[]
  shareable: boolean
  labels: Label[]
  sections: Section[]
  destinations: { id: string | null; name: string }[]
  onMove: ((sectionId: Section['id'] | null) => void) | undefined
  sortable?: boolean
  /** Shown where the tasks of many boards meet. */
  boardName?: string
  /** A sub-task's parent, named where it shows without it. */
  parentTitle?: string | null
}): ReactElement {
  const { t } = useI18n()
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [assigning, setAssigning] = useState<HTMLElement | null>(null)
  const [labeling, setLabeling] = useState<HTMLElement | null>(null)
  const [dating, setDating] = useState<HTMLElement | null>(null)
  const [moving, setMoving] = useState(false)
  const stopMoving = () => {
    setMoving(false)
  }
  const transferable = useTransferable(task, boardId)
  const link = useCopyLink(boardId, task.key, false)
  const remove = useRemoveTask(boardId, task)
  const panel = useTaskPanel(task.key)
  const newTask = useNewTaskHighlight(task.key)
  const editable = onMove !== undefined
  const completion = useCompleteToggle(task, boardId, sections, editable)
  const [showSubtasks, setShowSubtasks] = useState(false)
  const children = tasks.filter(each => each.parentId === task.id)
  const done = children.filter(each => each.completedAt !== null).length
  const facts =
    task.priority !== null ||
    task.dueDate !== null ||
    children.length > 0 ||
    task.commentCount > 0
  const choose = (action: () => void) => () => {
    setMenuAnchor(null)
    action()
  }

  const body = (
    <>
      <Meta>
        <CardCheck>
          <CompleteCheckbox
            title={task.title}
            completion={completion}
            // Space and Enter on the card start a keyboard drag.
            onKeyDown={event => {
              event.stopPropagation()
            }}
          />
        </CardCheck>
        <Typography variant="caption" color="textSecondary">
          {parentTitle === null
            ? task.key
            : `${task.key} · ${t('agenda.subtaskOf', { title: parentTitle })}`}
        </Typography>
        {boardName && <BoardChip name={boardName} />}
        {task.labels.map(label => (
          <LabelChip key={label.id} name={label.name} color={label.color} />
        ))}
      </Meta>
      <CardTitle done={completion.done}>
        <Link
          component="button"
          variant="body2"
          color={completion.done ? 'textSecondary' : 'textPrimary'}
          underline={completion.done ? 'none' : 'hover'}
          className="u-ta-left"
          onClick={() => {
            newTask.clear()
            panel.show()
          }}
        >
          {task.title}
        </Link>
      </CardTitle>
      {(facts || task.assignees.length > 0) && (
        <Meta>
          {task.priority !== null && <PriorityChip priority={task.priority} />}
          <DueChip task={task} />
          {children.length > 0 && (
            <Button
              variant="text"
              size="small"
              color={done === children.length ? 'success' : 'inherit'}
              startIcon={<Icon icon={CheckList} size={12} />}
              aria-expanded={showSubtasks}
              aria-label={t('board.subtaskProgress', {
                done,
                total: children.length
              })}
              onClick={() => {
                setShowSubtasks(shown => !shown)
              }}
              className="u-miw-auto u-ph-half"
            >
              {`${String(done)}/${String(children.length)}`}
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
        <Subtasks
          parentId={task.id}
          tasks={tasks}
          boardId={boardId}
          editable={editable}
        />
      )}
    </>
  )
  const frame = {
    label: `${task.key} ${task.title}`,
    highlighted: newTask.isNew,
    menu: onMove && (
      <IconButton
        size="small"
        aria-label={t('board.options', { key: task.key })}
        aria-haspopup="menu"
        aria-expanded={menuAnchor !== null}
        onClick={event => {
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
      <Menu
        anchorEl={menuAnchor}
        open={menuAnchor !== null}
        onClose={() => {
          setMenuAnchor(null)
        }}
      >
        <IconMenuItem
          icon={PersonAdd}
          onClick={choose(() => {
            setAssigning(menuAnchor)
          })}
        >
          {t('board.assign')}
        </IconMenuItem>
        <IconMenuItem
          icon={LabelIcon}
          onClick={choose(() => {
            setLabeling(menuAnchor)
          })}
        >
          {t('board.labels')}
        </IconMenuItem>
        <IconMenuItem
          icon={CalendarToday}
          onClick={choose(() => {
            setDating(menuAnchor)
          })}
        >
          {t('board.dueDate')}
        </IconMenuItem>
        {(destinations.length > 0 || transferable) && <Divider />}
        {destinations.map(destination => (
          <IconMenuItem
            icon={Moveto}
            key={destination.id ?? 'none'}
            onClick={choose(() => {
              onMove?.(destination.id)
            })}
          >
            {t('board.moveTo', { section: destination.name })}
          </IconMenuItem>
        ))}
        {transferable && (
          <IconMenuItem
            icon={FolderMoveto}
            onClick={choose(() => {
              setMoving(true)
            })}
          >
            {t('transfer.title')}
          </IconMenuItem>
        )}
        <Divider />
        <IconMenuItem
          icon={LinkIcon}
          onClick={event => {
            setMenuAnchor(null)
            link.copy(event.currentTarget)
          }}
        >
          {t('task.copyLink')}
        </IconMenuItem>
        <Divider />
        <IconMenuItem
          icon={Archive}
          onClick={choose(() => {
            remove.mutate('archived')
          })}
        >
          {t('archive.archive')}
        </IconMenuItem>
        <IconMenuItem
          icon={Trash}
          onClick={choose(() => {
            remove.mutate('trash')
          })}
        >
          {t('archive.delete')}
        </IconMenuItem>
      </Menu>
      {link.notice}
      <Toast
        open={remove.isError}
        autoHideDuration={4000}
        onClose={() => {
          remove.reset()
        }}
      >
        <Alert severity="error" role="alert">
          {t('archive.failed')}
        </Alert>
      </Toast>
      {dating && (
        <DatesEditor
          task={task}
          boardId={boardId}
          anchor={dating}
          onClose={() => {
            setDating(null)
          }}
        />
      )}
      {moving && (
        <TransferDialog
          task={task}
          boardId={boardId}
          onMoved={stopMoving}
          onClose={stopMoving}
        />
      )}
      {assigning && (
        <AssignPicker
          task={task}
          boardId={boardId}
          members={members}
          tasks={tasks}
          shareable={shareable}
          anchor={assigning}
          onClose={() => {
            setAssigning(null)
          }}
        />
      )}
      {labeling && (
        <LabelsPicker
          task={task}
          boardId={boardId}
          labels={labels}
          anchor={labeling}
          onClose={() => {
            setLabeling(null)
          }}
        />
      )}
    </>
  )
}
