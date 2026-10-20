import { Filter, Icon } from '@linagora/twake-icons'
import { Typography } from '@linagora/twake-mui'
import type { ReactElement } from 'react'
import { useParams } from 'react-router'

import { ColumnsSkeleton } from '@/ds/Columns'
import { viewIcon } from '@/ds/viewIcons'
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
      origin={{ icon: Filter, label: t('filters.title'), to: '/filters' }}
      current={view.name}
      actions={<ViewMenu view={view} starrable />}
      title={
        <>
          <Typography
            variant="h3"
            component="h1"
            className="u-flex u-flex-items-center"
          >
            <Icon icon={viewIcon(view.icon)} size={24} className="u-mr-1" />
            {view.name}
          </Typography>
          <div className="u-mt-half">
            <CriteriaChips criteria={view.criteria} />
          </div>
        </>
      }
    />
  )
}
