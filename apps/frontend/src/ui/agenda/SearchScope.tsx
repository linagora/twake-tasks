import { ToggleButton } from '@linagora/twake-mui'
import type { ReactElement } from 'react'
import { useSearchParams } from 'react-router'

import type { SearchScope } from '@/application/boards'
import { FilterBar, FilterChip } from '@/ds/FilterBar'
import { ViewToggleGroup } from '@/ds/PageHeader'
import { useFilterBoards } from '@/ui/agenda/filterBoards'
import { useI18n } from '@/ui/i18n/useI18n'

const STATUSES = ['all', 'open', 'done'] as const

/** `?status=` and `?board=` narrow the results, so a reload keeps them. */
export function useSearchScope(): [SearchScope, (scope: SearchScope) => void] {
  const [params, setParams] = useSearchParams()
  const status = params.get('status')
  const board = params.get('board')
  const scope: SearchScope = {
    ...((status === 'open' || status === 'done') && { status }),
    ...(board && { board })
  }
  const change = (next: SearchScope) => {
    setParams(
      current => {
        const updated = new URLSearchParams(current)
        for (const key of ['status', 'board'] as const) {
          const value = next[key]
          if (value) updated.set(key, value)
          else updated.delete(key)
        }
        return updated
      },
      { replace: true }
    )
  }
  return [scope, change]
}

export function ScopeBar({
  scope,
  onChange
}: {
  scope: SearchScope
  onChange: (scope: SearchScope) => void
}): ReactElement {
  const { t } = useI18n()
  const boards = useFilterBoards()
  const board = scope.board
  return (
    <FilterBar
      role="group"
      label={t('search.scope')}
      onEscape={() => undefined}
    >
      <ViewToggleGroup
        exclusive
        size="small"
        value={scope.status ?? 'all'}
        aria-label={t('search.status')}
        onChange={(_event, status: (typeof STATUSES)[number] | null) => {
          if (status)
            onChange({
              ...scope,
              status: status === 'all' ? undefined : status
            })
        }}
      >
        {STATUSES.map(status => (
          <ToggleButton key={status} value={status}>
            {t(`search.statuses.${status}`)}
          </ToggleButton>
        ))}
      </ViewToggleGroup>
      <FilterChip
        single
        name={t('filters.board')}
        shown={board ? boards.labelOf(board) : ''}
        removeLabel={t('search.anyBoard')}
        options={boards.options}
        value={board ? [board] : []}
        onChange={([picked]) => {
          onChange({ ...scope, board: picked })
        }}
      />
    </FilterBar>
  )
}
