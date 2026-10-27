import {
  Calendar,
  CalendarToday,
  CheckCircle,
  Filter,
  Icon,
  Plus,
  Profile
} from '@linagora/twake-icons'
import { Button, Checkbox, Link, Typography } from '@linagora/twake-mui'
import type { ReactElement, ReactNode } from 'react'

import type { AgendaTask, SearchResult } from '@/application/boards'
import { LabelChip } from '@/ds/Columns'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { Highlight } from '@/ds/Highlight'
import { TaskGroup, TaskRow } from '@/ds/TaskList'
import {
  AgendaTaskPanel,
  useAgendaTaskPanel
} from '@/ui/agenda/AgendaTaskPanel'
import { OriginContext, PageCrumbs, type Origin } from '@/ui/boards/Crumbs'
import { formatDay, inDays } from '@/ui/boards/dueLabel'
import { Assignees, DueChip, PriorityChip } from '@/ui/boards/TaskFacts'
import {
  useAgenda,
  useCompleteAgendaTask,
  type AgendaView
} from '@/ui/boards/queries'
import { useI18n, type I18nApi } from '@/ui/i18n/useI18n'
import { useNewTaskParam } from '@/ui/shell/useNewTaskParam'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

const contextOf = (task: AgendaTask, t: I18nApi['t']): string =>
  [
    task.key,
    task.boardName,
    task.parentTitle && t('agenda.subtaskOf', { title: task.parentTitle })
  ]
    .filter(Boolean)
    .join(' · ')

export function Group({
  label,
  tasks,
  tone,
  dated = false,
  highlight = ''
}: {
  label: string
  tasks: (AgendaTask | SearchResult)[]
  tone?: 'error'
  dated?: boolean
  highlight?: string
}): ReactElement {
  return (
    <TaskGroup label={label} count={tasks.length} tone={tone}>
      {tasks.map(task => (
        <AgendaRow
          key={task.id}
          task={task}
          showDue={!dated}
          highlight={highlight}
        />
      ))}
    </TaskGroup>
  )
}

function AgendaRow({
  task,
  showDue,
  highlight
}: {
  task: AgendaTask | SearchResult
  showDue: boolean
  highlight: string
}): ReactElement {
  const { t } = useI18n()
  const complete = useCompleteAgendaTask()
  const panel = useAgendaTaskPanel(task)
  const done = task.completedAt !== null

  return (
    <TaskRow
      label={`${task.key} ${task.title}`}
      check={
        <Checkbox
          size="small"
          checked={done || complete.isPending || complete.isSuccess}
          disabled={
            done ||
            task.canceledAt !== null ||
            !task.completable ||
            complete.isPending
          }
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
        <>
          <Link
            component="button"
            variant="body2"
            className="u-ta-left"
            onClick={() => {
              panel.show()
            }}
          >
            <Highlight text={task.title} query={highlight} />
          </Link>
          {panel.open && <AgendaTaskPanel task={task} onClose={panel.close} />}
        </>
      }
      context={contextOf(task, t)}
      excerpt={
        'excerpt' in task &&
        task.excerpt && <Highlight text={task.excerpt} query={highlight} />
      }
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
            <LabelChip key={label.id} name={label.name} color={label.color} />
          ))}
          {task.assignees.length > 0 && <Assignees people={task.assignees} />}
        </>
      }
    />
  )
}

const AGENDA_ICONS = {
  today: CalendarToday,
  upcoming: Calendar,
  mine: Profile
} as const

export function AgendaScreen(
  props:
    | { view: 'today' | 'upcoming' | 'mine' }
    | {
        view: AgendaView
        title: string
        origin: Origin
        actions?: ReactNode
        form?: ReactNode
        body?: ((tasks: AgendaTask[]) => ReactNode) | undefined
      }
): ReactElement {
  const { t } = useI18n()
  const { view } = props
  const agenda = useAgenda(view)
  const title = 'title' in props ? props.title : t(`agenda.${props.view}`)
  const actions = 'actions' in props ? props.actions : undefined
  const form = 'form' in props ? props.form : undefined
  const body = 'body' in props ? props.body : undefined
  const origin: Origin =
    'origin' in props
      ? props.origin
      : {
          icon: AGENDA_ICONS[props.view],
          label: t(`agenda.${props.view}`),
          to: `/${props.view}`
        }
  useDocumentTitle(title || null)

  const tasks = agenda.data?.tasks ?? []
  const empty = agenda.isSuccess && tasks.length === 0

  return (
    <OriginContext value={origin}>
      <main className="u-ph-2 u-pt-half u-pb-2">
        <PageCrumbs
          origin={origin}
          current={'origin' in props ? title || '…' : undefined}
          heading
          actions={actions}
        />
        {typeof view === 'string' && (
          <Typography variant="body2" color="textSecondary" className="u-mb-1">
            {t(EMPTY_AGENDA[view].scope)}
          </Typography>
        )}
        {form}
        {agenda.isError && (
          <Typography role="alert">{t('agenda.loadFailed')}</Typography>
        )}
        {agenda.isPending && <ListSkeleton label={t('app.loading')} />}
        {empty &&
          (typeof view === 'string' ? (
            <AgendaEmpty view={view} />
          ) : (
            <EmptyState
              icon={Filter}
              illustrated
              title={t('agenda.filterEmpty')}
            />
          ))}
        {agenda.data &&
          !empty &&
          (body ? (
            body(tasks)
          ) : (
            <ByDay today={agenda.data.today} tasks={tasks} />
          ))}
      </main>
    </OriginContext>
  )
}

const EMPTY_AGENDA = {
  today: {
    icon: CheckCircle,
    scope: 'agenda.scope',
    title: 'agenda.todayEmpty',
    due: 0
  },
  upcoming: {
    icon: CheckCircle,
    scope: 'agenda.scope',
    title: 'agenda.upcomingEmpty',
    due: 1
  },
  mine: {
    icon: Profile,
    scope: 'agenda.mineScope',
    title: 'agenda.mineEmpty',
    due: null
  }
} as const

function AgendaEmpty({
  view
}: {
  view: 'today' | 'upcoming' | 'mine'
}): ReactElement {
  const { t } = useI18n()
  const { openNewTask } = useNewTaskParam()
  const { icon, title, due } = EMPTY_AGENDA[view]
  return (
    <EmptyState
      icon={icon}
      illustrated
      title={t(title)}
      action={
        <Button
          startIcon={<Icon icon={Plus} />}
          onClick={() => {
            openNewTask(due === null ? undefined : inDays(due))
          }}
        >
          {t('newTask.open')}
        </Button>
      }
    />
  )
}

function ByDay({
  today,
  tasks
}: {
  today: string
  tasks: AgendaTask[]
}): ReactElement {
  const { t, lang } = useI18n()
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
    <>
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
    </>
  )
}
