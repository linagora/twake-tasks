import {
  Bell,
  CalendarToday,
  Flag,
  Folder,
  Icon,
  Label,
  Mosaic,
  People,
  Plus
} from '@linagora/twake-icons'
import { IconButton, Link, Tooltip, Typography } from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'
import { Link as RouterLink, useMatch, useParams } from 'react-router'

import { LabelChip, PersonChip } from '@/ds/Columns'
import {
  Properties,
  Property,
  PropertySelect,
  TitleInput
} from '@/ds/SidePanel'
import { isShareable, PRIORITIES, type Board, type Task } from '@/domain/board'
import { displayName } from '@/domain/person'
import { AssignPicker } from '@/ui/boards/AssignPicker'
import { useProjectName } from '@/ui/boards/BoardsScreen'
import { Dates } from '@/ui/boards/Dates'
import { LabelsPicker } from '@/ui/boards/LabelsPicker'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { useBoardChange, useMoveTask } from '@/ui/boards/queries'
import { Reminders } from '@/ui/boards/Reminders'
import { PriorityChip } from '@/ui/boards/TaskFacts'
import { EMBED_PREFIX } from '@/ui/embed/twakeSpace'
import { useI18n } from '@/ui/i18n/useI18n'

export function TaskProperties({
  task,
  boardId,
  board,
  editable,
  archived
}: {
  task: Task
  boardId: string
  board: Board | undefined
  editable: boolean
  archived: boolean
}): ReactElement {
  const { t } = useI18n()
  const [assigning, setAssigning] = useState<HTMLElement | null>(null)
  const [labeling, setLabeling] = useState<HTMLElement | null>(null)
  const unassign = useBoardChange(boardId, (api, userIds: string[]) =>
    api.setAssignees(boardId, task.id, userIds)
  )
  const unlabel = useBoardChange(boardId, (api, labelIds: string[]) =>
    api.setLabels(boardId, task.id, labelIds)
  )

  return (
    <>
      <Properties>
        {board && <BoardRow board={board} />}
        {board && task.parentId === null && (
          <SectionRow
            task={task}
            boardId={boardId}
            editable={editable}
            sections={board.sections}
          />
        )}
        <Property icon={<Icon icon={People} />} label={t('task.assignees')}>
          {task.assignees.map(person => (
            <PersonChip
              key={person.userId}
              avatar={
                <PersonAvatar
                  email={person.email}
                  name={person.name}
                  avatar={person.avatar}
                />
              }
              name={displayName(person)}
              remove={
                editable && board
                  ? {
                      label: t('task.unassign', { name: displayName(person) }),
                      disabled: unassign.isPending,
                      onClick: () => {
                        unassign.mutate(
                          task.assignees
                            .filter(each => each.userId !== person.userId)
                            .map(each => each.userId)
                        )
                      }
                    }
                  : undefined
              }
            />
          ))}
          {task.assignees.length === 0 && (
            <Typography variant="body2" color="textSecondary">
              {t('task.nobody')}
            </Typography>
          )}
          {editable && board && (
            <Tooltip title={t('task.addAssignees')}>
              <IconButton
                size="small"
                aria-label={t('task.addAssignees')}
                onClick={event => {
                  setAssigning(event.currentTarget)
                }}
              >
                <Icon icon={Plus} size={14} />
              </IconButton>
            </Tooltip>
          )}
        </Property>
        <Property icon={<Icon icon={Label} />} label={t('task.labels')}>
          {task.labels.map(label => (
            <LabelChip
              key={label.id}
              name={label.name}
              color={label.color}
              remove={
                editable && board
                  ? {
                      label: t('task.removeLabel', { name: label.name }),
                      disabled: unlabel.isPending,
                      onClick: () => {
                        unlabel.mutate(
                          task.labels
                            .filter(each => each.id !== label.id)
                            .map(each => each.id)
                        )
                      }
                    }
                  : undefined
              }
            />
          ))}
          {task.labels.length === 0 && (
            <Typography variant="body2" color="textSecondary">
              {t('task.noLabels')}
            </Typography>
          )}
          {editable && board && (
            <Tooltip title={t('task.addLabels')}>
              <IconButton
                size="small"
                aria-label={t('task.addLabels')}
                onClick={event => {
                  setLabeling(event.currentTarget)
                }}
              >
                <Icon icon={Plus} size={14} />
              </IconButton>
            </Tooltip>
          )}
        </Property>
        <PriorityRow task={task} boardId={boardId} editable={editable} />
        <Property icon={<Icon icon={CalendarToday} />} label={t('task.dates')}>
          <Dates task={task} boardId={boardId} editable={editable} />
        </Property>
        <Property icon={<Icon icon={Bell} />} label={t('task.reminders')}>
          <Reminders task={task} boardId={boardId} archived={archived} />
        </Property>
      </Properties>
      {assigning && board && (
        <AssignPicker
          task={task}
          boardId={boardId}
          members={board.members}
          tasks={board.tasks}
          shareable={isShareable(board)}
          anchor={assigning}
          onClose={() => {
            setAssigning(null)
          }}
        />
      )}
      {labeling && board && (
        <LabelsPicker
          task={task}
          boardId={boardId}
          labels={board.labels}
          anchor={labeling}
          onClose={() => {
            setLabeling(null)
          }}
        />
      )}
    </>
  )
}

export function Title({
  task,
  boardId,
  editable
}: {
  task: Task
  boardId: string
  editable: boolean
}): ReactElement {
  const { t } = useI18n()
  const [draft, setDraft] = useState(task.title)
  const rename = useBoardChange(boardId, (api, title: string) =>
    api.editTask(boardId, task.id, { title })
  )

  if (!editable) {
    return (
      <Typography variant="h4" component="h2">
        {task.title}
      </Typography>
    )
  }
  return (
    <div>
      <TitleInput
        multiline
        value={draft}
        inputProps={{ 'aria-label': t('task.title'), maxLength: 500 }}
        onChange={event => {
          setDraft(event.target.value.replace(/\n/g, ''))
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.querySelector('textarea')?.blur()
          }
          if (event.key === 'Escape') setDraft(task.title)
        }}
        onBlur={() => {
          const title = draft.trim()
          if (!title) setDraft(task.title)
          else if (title !== task.title) rename.mutate(title)
        }}
      />
      {rename.isError && (
        <Typography role="alert" variant="caption" color="error">
          {t('task.changeFailed')}
        </Typography>
      )}
    </div>
  )
}

function BoardRow({ board }: { board: Board }): ReactElement {
  const { t } = useI18n()
  const { projectId } = useParams()
  const projectName = useProjectName()(board.project)
  const to =
    projectId === undefined
      ? `/boards/${board.id}`
      : `${EMBED_PREFIX}${board.project.id}/boards/${board.id}`
  const onBoard = useMatch(to) !== null

  return (
    <Property icon={<Icon icon={Mosaic} />} label={t('task.board')}>
      <Typography variant="body2" className="u-miw-0">
        {onBoard ? (
          board.name
        ) : (
          <Link component={RouterLink} to={to} underline="hover">
            {board.name}
          </Link>
        )}
        {projectName !== board.name && (
          <Typography component="span" variant="body2" color="textSecondary">
            {` · ${projectName}`}
          </Typography>
        )}
      </Typography>
    </Property>
  )
}

function SectionRow({
  task,
  boardId,
  editable,
  sections
}: {
  task: Task
  boardId: string
  editable: boolean
  sections: { id: string; name: string }[]
}): ReactElement | null {
  const { t } = useI18n()
  const labelId = useId()
  const move = useMoveTask(boardId)
  const current = sections.find(section => section.id === task.sectionId)
  if (sections.length === 0) return null

  return (
    <Property
      id={labelId}
      icon={<Icon icon={Folder} />}
      label={t('task.section')}
    >
      {editable ? (
        <PropertySelect
          labelId={labelId}
          value={task.sectionId ?? ''}
          options={[
            ...(task.sectionId === null
              ? [{ value: '', label: t('board.noSection') }]
              : []),
            ...sections.map(section => ({
              value: section.id,
              label: section.name
            }))
          ]}
          onChange={(value: string) => {
            move.mutate({
              taskId: task.id,
              move: { sectionId: value === '' ? null : value }
            })
          }}
        />
      ) : (
        <Typography variant="body2">
          {current?.name ?? t('board.noSection')}
        </Typography>
      )}
    </Property>
  )
}

function PriorityRow({
  task,
  boardId,
  editable
}: {
  task: Task
  boardId: string
  editable: boolean
}): ReactElement {
  const { t } = useI18n()
  const labelId = useId()
  const edit = useBoardChange(boardId, (api, priority: Task['priority']) =>
    api.editTask(boardId, task.id, { priority })
  )
  const name = (level: Task['priority']) =>
    level === null ? t('task.noPriority') : <PriorityChip priority={level} />

  return (
    <Property
      id={labelId}
      icon={<Icon icon={Flag} />}
      label={t('task.priority')}
    >
      {editable ? (
        <PropertySelect
          labelId={labelId}
          value={task.priority === null ? '' : String(task.priority)}
          options={[null, ...PRIORITIES].map(level => ({
            value: level === null ? '' : String(level),
            label: name(level)
          }))}
          onChange={value => {
            edit.mutate(
              PRIORITIES.find(level => String(level) === value) ?? null
            )
          }}
        />
      ) : (
        <Typography variant="body2">{name(task.priority)}</Typography>
      )}
    </Property>
  )
}
