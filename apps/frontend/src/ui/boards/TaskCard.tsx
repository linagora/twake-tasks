import {
  Avatar,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  getInitials,
  IconButton,
  Link,
  Menu,
  MenuItem,
  nameToColor,
  Typography
} from '@linagora/twake-mui'
import { Dots, Icon } from '@linagora/twake-icons'
import { useId, useState, type ReactElement } from 'react'

import { Card, Row } from '@/ds/Columns'
import type { Label, Person, Section, Task } from '@/domain/board'
import { LabelsDialog } from '@/ui/boards/LabelsDialog'
import { useBoardChange } from '@/ui/boards/queries'
import { Subtasks } from '@/ui/boards/Subtasks'
import { TaskPanel } from '@/ui/boards/TaskPanel'
import { useI18n } from '@/ui/i18n/useI18n'

const PRIORITY_COLOR = {
  1: 'error',
  2: 'warning',
  3: 'info',
  4: 'default'
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
  const [open, setOpen] = useState(false)
  const editable = onMove !== undefined
  const due =
    task.dueDate &&
    new Intl.DateTimeFormat(lang, {
      dateStyle: 'medium',
      timeZone: 'UTC'
    }).format(new Date(task.dueDate))
  const choose = (action: () => void) => () => {
    setMenuAnchor(null)
    action()
  }

  return (
    <Card label={`${task.key} ${task.title}`}>
      <Row>
        <Typography variant="caption" color="textSecondary">
          {task.key}
        </Typography>
        {onMove && (
          <IconButton
            size="small"
            className="u-ml-auto"
            aria-label={t('board.options', { key: task.key })}
            aria-haspopup="menu"
            aria-expanded={menuAnchor !== null}
            onClick={event => {
              setMenuAnchor(event.currentTarget)
            }}
          >
            <Icon icon={Dots} />
          </IconButton>
        )}
      </Row>
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
      <Row>
        {task.priority !== null && (
          <Chip
            size="small"
            color={PRIORITY_COLOR[task.priority]}
            label={t('board.priority', { level: task.priority })}
          />
        )}
        {due && (
          <Typography variant="caption">
            {t('board.due', { date: due })}
          </Typography>
        )}
        {task.labels.map(label => (
          <Chip
            key={label.id}
            size="small"
            variant="outlined"
            label={label.name}
          />
        ))}
        {task.assignees.map(({ userId, email }, index) => (
          <Avatar
            key={userId}
            size="xs"
            color={nameToColor(email) ?? 'sunrise'}
            role="img"
            aria-label={t('board.assignee', { name: email })}
            className={index === 0 ? 'u-ml-auto' : undefined}
          >
            {getInitials(email, email)}
          </Avatar>
        ))}
      </Row>
      <Subtasks
        parentId={task.id}
        tasks={tasks}
        boardId={boardId}
        editable={editable}
        depth={2}
      />
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

function AssignDialog({
  task,
  boardId,
  members,
  onClose
}: {
  task: Task
  boardId: string
  members: Person[]
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const [chosen, setChosen] = useState(
    () => new Set(task.assignees.map(assignee => assignee.userId))
  )
  const assign = useBoardChange(boardId, (api, userIds: string[]) =>
    api.setAssignees(boardId, task.id, userIds)
  )
  const toggle = (userId: string) => {
    setChosen(previous => {
      const next = new Set(previous)
      if (!next.delete(userId)) next.add(userId)
      return next
    })
  }

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <form
        onSubmit={event => {
          event.preventDefault()
          assign.mutate([...chosen], { onSuccess: onClose })
        }}
      >
        <DialogTitle id={titleId}>
          {t('board.assignTitle', { key: task.key })}
        </DialogTitle>
        <DialogContent>
          <FormGroup>
            {members.map(member => (
              <FormControlLabel
                key={member.userId}
                label={member.email}
                control={
                  <Checkbox
                    checked={chosen.has(member.userId)}
                    onChange={() => {
                      toggle(member.userId)
                    }}
                  />
                }
              />
            ))}
          </FormGroup>
          {assign.isError && <p role="alert">{t('board.assignFailed')}</p>}
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={onClose}>
            {t('board.cancel')}
          </Button>
          <Button type="submit" disabled={assign.isPending}>
            {t('board.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
