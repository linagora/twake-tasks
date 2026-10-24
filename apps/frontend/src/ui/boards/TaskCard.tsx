import {
  Button,
  Divider,
  IconButton,
  Link,
  Menu,
  Typography
} from '@linagora/twake-mui'
import {
  CheckList,
  Comment,
  Dots,
  Icon,
  Label as LabelIcon,
  Moveto,
  PersonAdd
} from '@linagora/twake-icons'
import { useState, type KeyboardEvent, type ReactElement } from 'react'

import {
  Card,
  CardCheck,
  CardTitle,
  LabelChip,
  Meta,
  MetaChip
} from '@/ds/Columns'
import { IconMenuItem } from '@/ds/IconMenuItem'
import { SortableCard } from '@/ds/Sortable'
import type { Label, Person, Section, Task } from '@/domain/board'
import { AssignPicker } from '@/ui/boards/AssignPicker'
import { CompleteCheckbox } from '@/ui/boards/CompleteCheckbox'
import { LabelsPicker } from '@/ui/boards/LabelsPicker'
import { Subtasks } from '@/ui/boards/Subtasks'
import { Assignees, DueChip, PriorityChip } from '@/ui/boards/TaskFacts'
import { useCompleteToggle } from '@/ui/boards/useCompleteToggle'
import { useTaskPanel } from '@/ui/boards/useTaskPanel'
import { useI18n } from '@/ui/i18n/useI18n'

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
  sortable = false
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
}): ReactElement {
  const { t } = useI18n()
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [assigning, setAssigning] = useState<HTMLElement | null>(null)
  const [labeling, setLabeling] = useState<HTMLElement | null>(null)
  const panel = useTaskPanel(task.key)
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
          {task.key}
        </Typography>
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
        {destinations.length > 0 && <Divider />}
        {destinations.map((destination, index) => (
          <IconMenuItem
            icon={index === 0 ? Moveto : undefined}
            key={destination.id ?? 'none'}
            onClick={choose(() => {
              onMove?.(destination.id)
            })}
          >
            {t('board.moveTo', { section: destination.name })}
          </IconMenuItem>
        ))}
      </Menu>
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
