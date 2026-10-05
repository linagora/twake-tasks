import { Link, Typography } from '@linagora/twake-mui'
import type { ReactElement } from 'react'
import { Link as RouterLink, useParams } from 'react-router'

import type { AgendaTask } from '@/application/boards'
import { dueLabel, formatDay } from '@/ui/boards/dueLabel'
import { useAgenda, useFilters, type AgendaView } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

function Group({
  label,
  tasks
}: {
  label: string
  tasks: AgendaTask[]
}): ReactElement {
  const { lang } = useI18n()
  return (
    <section aria-label={label} className="u-mb-2">
      <Typography variant="h5" component="h2">
        {label}
      </Typography>
      <ul>
        {tasks.map(task => (
          <li key={task.id}>
            <Link component={RouterLink} to={`/boards/${task.boardId}`}>
              {task.title}
            </Link>
            <Typography variant="caption" color="textSecondary">
              {` ${task.key} · ${task.boardName}`}
              {task.dueTime ? ` · ${dueLabel(task, lang) ?? ''}` : ''}
            </Typography>
          </li>
        ))}
      </ul>
    </section>
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
      {agenda.isSuccess && tasks.length === 0 && (
        <Typography>{t('agenda.empty')}</Typography>
      )}
      {overdue.length > 0 && (
        <Group label={t('agenda.overdue')} tasks={overdue} />
      )}
      {days.map(day => (
        <Group
          key={day}
          label={day === today ? t('agenda.today') : formatDay(day, lang)}
          tasks={tasks.filter(task => task.dueDate === day)}
        />
      ))}
      {undated.length > 0 && (
        <Group label={t('agenda.noDate')} tasks={undated} />
      )}
    </main>
  )
}
