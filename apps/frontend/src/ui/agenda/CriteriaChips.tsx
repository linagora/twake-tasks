import { Chip, Typography } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import type { FilterCriteria } from '@/application/boards'
import { LabelChip } from '@/ds/Columns'
import { ChipList, CriterionGroup, ReadChip } from '@/ds/CriterionChips'
import { useCriteriaParts } from '@/ui/agenda/useCriteriaSummary'
import { useI18n } from '@/ui/i18n/useI18n'

// Criteria past these hide behind a chip that shows them, and values past
// these behind a count, whose tooltip spells them out.
const SHOWN_CRITERIA = 3
const SHOWN_VALUES = 2

/**
 * A view's criteria under its name: each named in plain words, then its
 * values as chips, the labels in their colours; the many ones folded.
 */
export function CriteriaChips({
  criteria
}: {
  criteria: FilterCriteria
}): ReactElement {
  const { t } = useI18n()
  const parts = useCriteriaParts()(criteria)
  const [all, setAll] = useState(false)
  const shown = all ? parts : parts.slice(0, SHOWN_CRITERIA)
  const folded = parts.length - shown.length

  return (
    <ChipList label={t('filters.filtersSection')}>
      {parts.length === 0 && (
        <Typography component="li" variant="body2" color="textSecondary">
          {t('filters.everything')}
        </Typography>
      )}
      {shown.map(part => {
        const rest = part.values.slice(SHOWN_VALUES)
        return (
          <CriterionGroup
            key={part.key}
            icon={part.icon}
            name={part.name}
            label={t('filters.criterion', {
              name: part.name,
              value: part.values.join(t('filters.or'))
            })}
          >
            {part.values
              .slice(0, SHOWN_VALUES)
              .map(value =>
                part.colored ? (
                  <LabelChip key={value} name={value} />
                ) : (
                  <ReadChip key={value} label={value} />
                )
              )}
            {rest.length > 0 && (
              <ReadChip
                label={`+${String(rest.length)}`}
                more={rest.join(', ')}
              />
            )}
          </CriterionGroup>
        )
      })}
      {folded > 0 && (
        <li>
          <Chip
            size="small"
            label={t('filters.moreCriteria', { count: folded })}
            onClick={() => {
              setAll(true)
            }}
          />
        </li>
      )}
    </ChipList>
  )
}
