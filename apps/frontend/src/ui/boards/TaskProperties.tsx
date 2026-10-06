import {
  Bell,
  CalendarToday,
  Flag,
  Icon,
  Label,
  Mosaic,
  Pen,
  People
} from '@linagora/twake-icons'
import { IconButton, Typography } from '@linagora/twake-mui'
import { useId, useState, type ReactElement } from 'react'

import { LabelChip } from '@/ds/Columns'
import {
  Inline,
  Properties,
  Property,
  PropertySelect,
  TitleInput
} from '@/ds/SidePanel'
import type { Board, Task } from '@/domain/board'
import { AssignDialog } from '@/ui/boards/AssignDialog'
import { Dates } from '@/ui/boards/Dates'
import { LabelsDialog } from '@/ui/boards/LabelsDialog'
import { PersonAvatar } from '@/ui/boards/PersonAvatar'
import { useBoardChange, useMoveTask } from '@/ui/boards/queries'
import { Reminders } from '@/ui/boards/Reminders'
import { useI18n } from '@/ui/i18n/useI18n'

const PRIORITIES = [1, 2, 3, 4] as const

export function TaskProperties({
  task,
  boardId,
  board,
  editable
}: {
  task: Task
  boardId: string
  board: Board | undefined
  editable: boolean
}): ReactElement {
  const { t } = useI18n()
  const [assigning, setAssigning] = useState(false)
  const [labeling, setLabeling] = useState(false)

  return (
    <>
      <Properties>
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
            <Inline key={person.userId}>
              <PersonAvatar email={person.email} />
              <Typography variant="body2">{person.email}</Typography>
            </Inline>
          ))}
          {task.assignees.length === 0 && (
            <Typography variant="body2" color="textSecondary">
              {t('task.nobody')}
            </Typography>
          )}
          {editable && board && (
            <IconButton
              size="small"
              aria-label={t('task.editAssignees')}
              onClick={() => {
                setAssigning(true)
              }}
            >
              <Icon icon={Pen} size={14} />
            </IconButton>
          )}
        </Property>
        <Property icon={<Icon icon={Label} />} label={t('task.labels')}>
          {task.labels.map(label => (
            <LabelChip key={label.id} name={label.name} />
          ))}
          {task.labels.length === 0 && (
            <Typography variant="body2" color="textSecondary">
              {t('task.noLabels')}
            </Typography>
          )}
          {editable && board && (
            <IconButton
              size="small"
              aria-label={t('task.editLabels')}
              onClick={() => {
                setLabeling(true)
              }}
            >
              <Icon icon={Pen} size={14} />
            </IconButton>
          )}
        </Property>
        <PriorityRow task={task} boardId={boardId} editable={editable} />
        <Property icon={<Icon icon={CalendarToday} />} label={t('task.dates')}>
          <Dates task={task} boardId={boardId} editable={editable} />
        </Property>
        <Property icon={<Icon icon={Bell} />} label={t('task.reminders')}>
          <Reminders task={task} boardId={boardId} />
        </Property>
      </Properties>
      {assigning && board && (
        <AssignDialog
          task={task}
          boardId={boardId}
          members={board.members}
          onClose={() => {
            setAssigning(false)
          }}
        />
      )}
      {labeling && board && (
        <LabelsDialog
          task={task}
          boardId={boardId}
          labels={board.labels}
          onClose={() => {
            setLabeling(false)
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
      icon={<Icon icon={Mosaic} />}
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
    level === null ? t('task.noPriority') : t('board.priority', { level })

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
