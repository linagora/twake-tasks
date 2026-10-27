import {
  CalendarToday,
  Dashboard,
  Flag,
  Label,
  Mosaic,
  People
} from '@linagora/twake-icons'

import type { FilterCriteria } from '@/application/boards'
import { displayName } from '@/domain/person'
import type { IconComponent } from '@/ds/viewIcons'
import { useBoards, usePeople } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

/** A criterion of a view in use, named with its values. */
export interface CriterionPart {
  key: keyof FilterCriteria
  icon: IconComponent
  name: string
  values: string[]
  /** Labels, drawn in their colours. */
  colored?: boolean
}

/** A view's criteria in use, in the order the view's editor shows them. */
export function useCriteriaParts(): (
  criteria: FilterCriteria
) => CriterionPart[] {
  const { t } = useI18n()
  const boards = useBoards()
  const people = usePeople()
  const assignee = (value: string) => {
    if (value === 'me') return t('filters.assignees.me')
    if (value === 'nobody') return t('filters.assignees.unassigned')
    const person = people.data?.find(each => each.userId === value)
    return person ? displayName(person) : '…'
  }
  return criteria =>
    (
      [
        criteria.boards && {
          key: 'boards',
          icon: Dashboard,
          name: t('viewTask.board'),
          values: criteria.boards.map(
            id => boards.data?.find(each => each.id === id)?.name ?? '…'
          )
        },
        criteria.statuses && {
          key: 'statuses',
          icon: Mosaic,
          name: t('viewTask.status'),
          values: criteria.statuses
        },
        criteria.assignees && {
          key: 'assignees',
          icon: People,
          name: t('filters.assignee'),
          values: criteria.assignees.map(assignee)
        },
        criteria.labels && {
          key: 'labels',
          icon: Label,
          name: t('filters.label'),
          values: criteria.labels,
          colored: true
        },
        criteria.priorities && {
          key: 'priorities',
          icon: Flag,
          name: t('filters.priority'),
          values: criteria.priorities.map(level =>
            t('board.priority', { level })
          )
        },
        criteria.dues && {
          key: 'dues',
          icon: CalendarToday,
          name: t('filters.due'),
          values: criteria.dues.map(due => t(`filters.dues.${due}`))
        }
      ] satisfies (CriterionPart | undefined)[]
    ).flatMap(part => (part && part.values.length > 0 ? [part] : []))
}

/** A view's criteria in a line, as the list of views says them. */
export function useCriteriaSummary(): (criteria: FilterCriteria) => string {
  const { t } = useI18n()
  const partsOf = useCriteriaParts()
  return criteria => {
    const parts = partsOf(criteria).map(part =>
      t('filters.criterion', {
        name: part.name,
        value: part.values.join(t('filters.or'))
      })
    )
    return parts.length > 0
      ? parts.join(t('filters.and'))
      : t('filters.everything')
  }
}
