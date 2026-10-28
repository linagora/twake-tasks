import { Compass, Left, WarningCircle } from '@linagora/twake-icons'
import { Button } from '@linagora/twake-mui'
import { useEffect, type ReactElement } from 'react'
import { Link as RouterLink, useRouteError } from 'react-router'

import { EmptyState } from '@/ds/EmptyState'
import { Icon } from '@/ds/Icon'
import { PageCrumbs, useBoardsOrigin } from '@/ui/boards/Crumbs'
import { useI18n } from '@/ui/i18n/useI18n'
import { useReporting } from '@/ui/reporting/ReportingProvider'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

export function NotFoundScreen({
  title,
  back
}: {
  title?: string
  back?: { to: string; label: string }
}): ReactElement {
  const { t } = useI18n()
  const origin = useBoardsOrigin()
  useDocumentTitle(t('problems.notFound'))
  const { to, label } = back ?? { to: '/', label: t('board.back') }
  return (
    <main className="u-ph-2 u-pt-half u-pb-2">
      <PageCrumbs origin={origin} current={t('problems.notFound')} />
      <EmptyState
        heading
        icon={Compass}
        title={title ?? t('problems.notFound')}
        text={t('problems.notFoundHint')}
        action={
          <Button
            component={RouterLink}
            to={to}
            variant="secondary"
            startIcon={<Icon icon={Left} />}
          >
            {label}
          </Button>
        }
      />
    </main>
  )
}

// Rendered by the router in place of a screen that threw while rendering.
export function CrashScreen(): ReactElement {
  const { t } = useI18n()
  const { reportCrash } = useReporting()
  const error = useRouteError()
  useEffect(() => {
    reportCrash(error, null)
  }, [reportCrash, error])
  return (
    <main className="u-p-2">
      <EmptyState
        heading
        tone="error"
        icon={WarningCircle}
        title={t('problems.crash')}
        text={t('problems.crashHint')}
        action={
          <Button
            onClick={() => {
              window.location.reload()
            }}
          >
            {t('problems.reload')}
          </Button>
        }
      />
    </main>
  )
}
