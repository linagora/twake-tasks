import {
  Calendar,
  CalendarToday,
  CheckCircle,
  Filter,
  Pen,
  Plus,
  Profile
} from '@linagora/twake-icons'
import { Button, Link, Typography } from '@linagora/twake-mui'
import { useState, type ReactElement, type ReactNode } from 'react'
import { useParams } from 'react-router'

import {
  ApiError,
  type AgendaTask,
  type SearchResult
} from '@/application/boards'
import {
  Card,
  CardTitle,
  Column,
  Columns,
  EmptyColumn,
  LabelChip,
  Meta
} from '@/ds/Columns'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { Highlight } from '@/ds/Highlight'
import { Icon } from '@/ds/Icon'
import { TaskGroup, TaskRow } from '@/ds/TaskList'
import {
  AgendaTaskPanel,
  useAgendaTaskPanel
} from '@/ui/agenda/AgendaTaskPanel'
import { FilterForm } from '@/ui/agenda/FiltersScreen'
import { focusOnMount } from '@/ui/focusOnMount'
import { OriginContext, PageCrumbs, type Origin } from '@/ui/boards/Crumbs'
import { formatDay, inDays } from '@/ui/boards/dueLabel'
import { LayoutToggle } from '@/ui/boards/Layouts'
import { Assignees, DueChip, PriorityChip } from '@/ui/boards/TaskFacts'
import { useAgenda, useFilters, type AgendaView } from '@/ui/boards/queries'
import { useI18n, type I18nApi } from '@/ui/i18n/useI18n'
import { NotFoundScreen } from '@/ui/shell/Problems'
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
  const panel = useAgendaTaskPanel(task)

  return (
    <TaskRow
      label={`${task.key} ${task.title}`}
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

const FILTER_LAYOUTS = ['list', 'board'] as const
type FilterLayout = (typeof FILTER_LAYOUTS)[number]

// Open tasks only, so done and canceled get no column. A task outside any
// section is to do.
const OPEN_CATEGORIES = ['backlog', 'unstarted', 'started'] as const

// Remembered on this device only: a saved filter has no stored layout.
function useFilterLayout(filterId: string) {
  const key = `filter-layout:${filterId}`
  const [layout, setLayout] = useState<FilterLayout>(() => {
    try {
      return localStorage.getItem(key) === 'board' ? 'board' : 'list'
    } catch {
      return 'list'
    }
  })
  const choose = (next: FilterLayout) => {
    setLayout(next)
    try {
      localStorage.setItem(key, next)
    } catch {
      // Private browsing: the choice lasts until the page closes.
    }
  }
  return [layout, choose] as const
}

export function FilterScreen(): ReactElement {
  const { filterId = '' } = useParams()
  return <FilterView key={filterId} filterId={filterId} />
}

function FilterView({ filterId }: { filterId: string }): ReactElement {
  const { t } = useI18n()
  const filters = useFilters()
  const agenda = useAgenda({ filterId })
  const [layout, setLayout] = useFilterLayout(filterId)
  const [editing, setEditing] = useState(false)
  // The Edit button takes the focus back from the form that replaced it
  const [closed, setClosed] = useState(false)
  const filter = filters.data?.find(each => each.id === filterId)
  if (agenda.error instanceof ApiError && agenda.error.status === 404) {
    return (
      <NotFoundScreen
        title={t('filters.notFound')}
        back={{ to: '/filters', label: t('filters.back') }}
      />
    )
  }
  return (
    <AgendaScreen
      view={{ filterId }}
      title={filter?.name ?? ''}
      origin={{ icon: Filter, label: t('filters.title'), to: '/filters' }}
      actions={
        <>
          {filter && !editing && (
            <Button
              ref={closed ? focusOnMount : undefined}
              variant="secondary"
              startIcon={<Icon icon={Pen} />}
              onClick={() => {
                setEditing(true)
              }}
            >
              {t('filters.editTitle')}
            </Button>
          )}
          <LayoutToggle
            layouts={FILTER_LAYOUTS}
            value={layout}
            onChange={setLayout}
          />
        </>
      }
      form={
        filter &&
        editing && (
          <div className="u-mb-2">
            <FilterForm
              filter={filter}
              onClose={() => {
                setClosed(true)
                setEditing(false)
              }}
            />
          </div>
        )
      }
      body={
        layout === 'board' ? tasks => <ByStatus tasks={tasks} /> : undefined
      }
    />
  )
}

function ByStatus({ tasks }: { tasks: AgendaTask[] }): ReactElement {
  const { t } = useI18n()
  const columns = OPEN_CATEGORIES.map(category => ({
    category,
    tasks: tasks.filter(task => (task.category ?? 'unstarted') === category)
  })).filter(column => column.category !== 'backlog' || column.tasks.length > 0)
  return (
    <Columns>
      {columns.map(column => (
        <Column
          key={column.category}
          title={t(`section.category.${column.category}`)}
          count={column.tasks.length}
        >
          {column.tasks.map(task => (
            <FilterCard key={task.id} task={task} />
          ))}
          {column.tasks.length === 0 && (
            <EmptyColumn label={t('board.emptyColumn')} />
          )}
        </Column>
      ))}
    </Columns>
  )
}

function FilterCard({ task }: { task: AgendaTask }): ReactElement {
  const { t } = useI18n()
  const panel = useAgendaTaskPanel(task)
  return (
    <Card label={`${task.key} ${task.title}`}>
      <Typography variant="caption" color="textSecondary">
        {contextOf(task, t)}
      </Typography>
      <CardTitle>
        <Link
          component="button"
          color="inherit"
          underline="none"
          className="u-ta-left"
          onClick={() => {
            panel.show()
          }}
        >
          {task.title}
        </Link>
        {panel.open && <AgendaTaskPanel task={task} onClose={panel.close} />}
      </CardTitle>
      {(task.priority !== null ||
        task.dueDate !== null ||
        task.labels.length > 0 ||
        task.assignees.length > 0) && (
        <Meta>
          {task.priority !== null && <PriorityChip priority={task.priority} />}
          <DueChip task={task} />
          {task.labels.map(label => (
            <LabelChip key={label.id} name={label.name} color={label.color} />
          ))}
          {task.assignees.length > 0 && <Assignees people={task.assignees} />}
        </Meta>
      )}
    </Card>
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
