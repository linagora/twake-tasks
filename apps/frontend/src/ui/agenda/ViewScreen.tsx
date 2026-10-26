import { Eye } from '@linagora/twake-icons'
import type { ReactElement } from 'react'
import { useParams } from 'react-router'

import { ColumnsSkeleton } from '@/ds/Columns'
import { CriteriaChips } from '@/ui/agenda/CriteriaChips'
import { TasksView } from '@/ui/agenda/TasksView'
import { ViewMenu } from '@/ui/agenda/ViewMenu'
import { useFilters } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'
import { NotFoundScreen } from '@/ui/shell/Problems'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

// A saved view: tasks picked by its criteria, in the layout chosen for it.
export function ViewScreen(): ReactElement {
  const { t } = useI18n()
  const { filterId = '' } = useParams()
  const filters = useFilters()
  const view = filters.data?.find(filter => filter.id === filterId)
  useDocumentTitle(view?.name ?? null)

  if (filters.isPending) {
    return <ColumnsSkeleton label={t('app.loading')} />
  }
  if (!view) {
    return (
      <NotFoundScreen
        title={t('filters.notFound')}
        back={{ to: '/filters', label: t('filters.back') }}
      />
    )
  }
  return (
    <TasksView
      key={view.id}
      source={{ filterId }}
      criteria={view.criteria}
      layout={view.layout}
      groupBy={view.groupBy}
      allColumns={view.allColumns}
      origin={{ icon: Eye, label: t('filters.title'), to: '/filters' }}
      current={view.name}
      actions={<ViewMenu view={view} starrable />}
      details={<CriteriaChips criteria={view.criteria} />}
    />
  )
}
