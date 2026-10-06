import { CheckCircle, Profile } from '@linagora/twake-icons'
import { Checkbox, Link, Typography } from '@linagora/twake-mui'
import type { ReactElement } from 'react'
import { Link as RouterLink, useParams } from 'react-router'

import type { AgendaTask } from '@/application/boards'
import { LabelChip } from '@/ds/Columns'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { TaskGroup, TaskRow } from '@/ds/TaskList'
import { formatDay } from '@/ui/boards/dueLabel'
import { Assignees, DueChip, PriorityChip } from '@/ui/boards/TaskFacts'
import {
  useAgenda,
  useCompleteAgendaTask,
  useFilters,
  type AgendaView
} from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

export function Group({
  label,
  tasks,
  tone,
  dated = false
}: {
  label: string
  tasks: AgendaTask[]
  tone?: 'error'
  dated?: boolean
}): ReactElement {
  return (
    <TaskGroup label={label} count={tasks.length} tone={tone}>
      {tasks.map(task => (
        <AgendaRow key={task.id} task={task} showDue={!dated} />
      ))}
    </TaskGroup>
  )
}

function AgendaRow({
  task,
  showDue
}: {
  task: AgendaTask
  showDue: boolean
}): ReactElement {
  const { t } = useI18n()
  const complete = useCompleteAgendaTask()
  const done = task.completedAt !== null

  return (
    <TaskRow
      label={`${task.key} ${task.title}`}
      check={
        <Checkbox
          size="small"
          checked={done || complete.isPending || complete.isSuccess}
          disabled={done || task.canceledAt !== null || complete.isPending}
          slotProps={{
            input: {
              'aria-label': t('layout.complete', { title: task.title })
            }
          }}
          onChange={() => {
            complete.mutate(task)
          }}
        />
      }
      title={
        <Link
          component={RouterLink}
          to={`/boards/${task.boardId}?task=${task.key}`}
        >
          {task.title}
        </Link>
      }
      context={`${task.key} · ${task.boardName}`}
      facts={
        <>
          {complete.isError && (
            <Typography role="alert" variant="caption" color="error">
              {t('agenda.completeFailed')}
            </Typography>
          )}
          {task.priority !== null && <PriorityChip priority={task.priority} />}
          {showDue && <DueChip task={task} />}
          {task.labels.map(label => (
            <LabelChip key={label.id} name={label.name} />
          ))}
          {task.assignees.length > 0 && <Assignees people={task.assignees} />}
        </>
      }
    />
  )
}

export function FilterScreen(): ReactElement {
  const { filterId = '' } = useParams()
  const filters = useFilters()
  return (
    <AgendaScreen
      view={{ filterId }}
      title={filters.data?.find(filter => filter.id === filterId)?.name ?? ''}
    />
  )
}

export function AgendaScreen(
  props:
    | { view: 'today' | 'upcoming' | 'mine' }
    | { view: AgendaView; title: string }
): ReactElement {
  const { t, lang } = useI18n()
  const { view } = props
  const agenda = useAgenda(view)
  const title = 'title' in props ? props.title : t(`agenda.${props.view}`)
  useDocumentTitle(title || null)

  const today = agenda.data?.today ?? ''
  const tasks = agenda.data?.tasks ?? []
  const overdue = tasks.filter(
    task => task.dueDate !== null && task.dueDate < today
  )
  const undated = tasks.filter(task => task.dueDate === null)
  const days = [
    ...new Set(
      tasks.flatMap(task =>
        task.dueDate && task.dueDate >= today ? [task.dueDate] : []
      )
    )
  ]

  return (
    <main className="u-p-2">
      <Typography variant="h3" component="h1" className="u-mb-2">
        {title}
      </Typography>
      {agenda.isError && (
        <Typography role="alert">{t('agenda.loadFailed')}</Typography>
      )}
      {agenda.isPending && <ListSkeleton label={t('app.loading')} />}
      {agenda.isSuccess &&
        tasks.length === 0 &&
        (view === 'mine' ? (
          <EmptyState
            icon={Profile}
            title={t('agenda.mineEmpty')}
            text={t('agenda.mineEmptyHint')}
          />
        ) : (
          <EmptyState
            icon={CheckCircle}
            title={t('agenda.empty')}
            text={t('agenda.emptyHint')}
          />
        ))}
      {overdue.length > 0 && (
        <Group label={t('agenda.overdue')} tasks={overdue} tone="error" />
      )}
      {days.map(day => (
        <Group
          key={day}
          label={day === today ? t('agenda.today') : formatDay(day, lang)}
          tasks={tasks.filter(task => task.dueDate === day)}
          dated
        />
      ))}
      {undated.length > 0 && (
        <Group label={t('agenda.noDate')} tasks={undated} />
      )}
    </main>
  )
}
