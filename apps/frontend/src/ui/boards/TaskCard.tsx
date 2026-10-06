import {
  Avatar,
  Button,
  getInitials,
  IconButton,
  Link,
  Menu,
  MenuItem,
  nameToColor,
  Typography
} from '@linagora/twake-mui'
import {
  CalendarToday,
  CheckList,
  Comment,
  Dots,
  Flag,
  Icon
} from '@linagora/twake-icons'
import { useState, type ReactElement } from 'react'
import { useSearchParams } from 'react-router'

import {
  AvatarStack,
  Card,
  CardTitle,
  LabelChip,
  Meta,
  MetaChip
} from '@/ds/Columns'
import type { Label, Person, Section, Task } from '@/domain/board'
import { AssignDialog } from '@/ui/boards/AssignDialog'
import { dueLabel, shortDay, urgency } from '@/ui/boards/dueLabel'
import { LabelsDialog } from '@/ui/boards/LabelsDialog'
import { Subtasks } from '@/ui/boards/Subtasks'
import { TaskPanel } from '@/ui/boards/TaskPanel'
import { useI18n } from '@/ui/i18n/useI18n'

const PRIORITY_TONE = {
  1: 'error',
  2: 'warning',
  3: 'info',
  4: 'neutral'
} as const

export function TaskCard({
  task,
  tasks,
  boardId,
  members,
  labels,
  destinations,
  onMove
}: {
  task: Task
  tasks: Task[]
  boardId: string
  members: Person[]
  labels: Label[]
  destinations: { id: string | null; name: string }[]
  onMove: ((sectionId: Section['id'] | null) => void) | undefined
}): ReactElement {
  const { t, lang } = useI18n()
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [labeling, setLabeling] = useState(false)
  const [params] = useSearchParams()
  const [open, setOpen] = useState(params.get('task') === task.key)
  const editable = onMove !== undefined
  const due = dueLabel(task, lang)
  const [showSubtasks, setShowSubtasks] = useState(false)
  const children = tasks.filter(each => each.parentId === task.id)
  const done = children.filter(each => each.completedAt !== null).length
  const dueTone = urgency(task)
  const shownAssignees = task.assignees.length > 3 ? 2 : 3
  const hiddenAssignees = task.assignees.length - shownAssignees
  const facts =
    task.priority !== null ||
    task.dueDate !== null ||
    children.length > 0 ||
    task.commentCount > 0
  const choose = (action: () => void) => () => {
    setMenuAnchor(null)
    action()
  }

  return (
    <Card
      label={`${task.key} ${task.title}`}
      menu={
        onMove && (
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
        )
      }
    >
      <Meta>
        <Typography variant="caption" color="textSecondary">
          {task.key}
        </Typography>
        {task.labels.map(label => (
          <LabelChip key={label.id} name={label.name} />
        ))}
      </Meta>
      <CardTitle>
        <Link
          component="button"
          variant="body1"
          color="textPrimary"
          underline="hover"
          className="u-ta-left"
          onClick={() => {
            setOpen(true)
          }}
        >
          {task.title}
        </Link>
      </CardTitle>
      {(facts || task.assignees.length > 0) && (
        <Meta>
          {task.priority !== null && (
            <MetaChip
              icon={<Icon icon={Flag} />}
              tone={PRIORITY_TONE[task.priority]}
              label={t('board.priorityLabel', { level: task.priority })}
            >
              {t('board.priority', { level: task.priority })}
            </MetaChip>
          )}
          {task.dueDate && due && (
            <MetaChip
              icon={<Icon icon={CalendarToday} />}
              tone={dueTone}
              label={
                dueTone === 'error'
                  ? t('board.overdue', { date: due })
                  : t('board.due', { date: due })
              }
            >
              {shortDay(task.dueDate, lang)}
            </MetaChip>
          )}
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
          {task.assignees.length > 0 && (
            <AvatarStack>
              {task.assignees
                .slice(0, shownAssignees)
                .map(({ userId, email }) => (
                  <Avatar
                    key={userId}
                    size={24}
                    color={nameToColor(email) ?? 'sunrise'}
                    role="img"
                    aria-label={t('board.assignee', { name: email })}
                  >
                    {getInitials(email, email)}
                  </Avatar>
                ))}
              {hiddenAssignees > 0 && (
                <Avatar
                  size={24}
                  role="img"
                  aria-label={t('board.moreAssignees', {
                    smart_count: hiddenAssignees
                  })}
                >
                  {`+${String(hiddenAssignees)}`}
                </Avatar>
              )}
            </AvatarStack>
          )}
        </Meta>
      )}
      {showSubtasks && (
        <Subtasks
          parentId={task.id}
          tasks={tasks}
          boardId={boardId}
          editable={editable}
          depth={2}
        />
      )}
      <Menu
        anchorEl={menuAnchor}
        open={menuAnchor !== null}
        onClose={() => {
          setMenuAnchor(null)
        }}
      >
        <MenuItem
          onClick={choose(() => {
            setAssigning(true)
          })}
        >
          {t('board.assign')}
        </MenuItem>
        <MenuItem
          onClick={choose(() => {
            setLabeling(true)
          })}
        >
          {t('board.labels')}
        </MenuItem>
        {destinations.map(destination => (
          <MenuItem
            key={destination.id ?? 'none'}
            onClick={choose(() => {
              onMove?.(destination.id)
            })}
          >
            {t('board.moveTo', { section: destination.name })}
          </MenuItem>
        ))}
      </Menu>
      {open && (
        <TaskPanel
          task={task}
          boardId={boardId}
          editable={editable}
          depth={1}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
      {assigning && (
        <AssignDialog
          task={task}
          boardId={boardId}
          members={members}
          onClose={() => {
            setAssigning(false)
          }}
        />
      )}
      {labeling && (
        <LabelsDialog
          task={task}
          boardId={boardId}
          labels={labels}
          onClose={() => {
            setLabeling(false)
          }}
        />
      )}
    </Card>
  )
}
