import { Typography } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import type { ViewTaskFact } from '@/application/viewTask'
import { useI18n } from '@/ui/i18n/useI18n'

/**
 * Says what a task made from a view was created without, as it may then not
 * show in the view; nothing when it has all the view asks.
 */
export function UnsetMessage({
  created
}: {
  created: { key: string; unset: readonly ViewTaskFact[] } | undefined
}): ReactElement | null {
  const { t, lang } = useI18n()
  if (!created || created.unset.length === 0) return null
  const facts = new Intl.ListFormat(lang, { type: 'conjunction' }).format(
    created.unset.map(fact => t(`viewTask.unset.${fact}`))
  )
  return (
    <Typography role="status" variant="caption" color="warning">
      {t('viewTask.created', { task: created.key, facts })}
    </Typography>
  )
}
