import { Button, Typography } from '@linagora/twake-mui'
import type { ReactElement } from 'react'

import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

export function HomeScreen(): ReactElement {
  const { t } = useI18n()
  const { user, signOut } = useSession()
  useDocumentTitle(null)

  return (
    <main className="u-p-2">
      <Typography variant="h1">{t('app.name')}</Typography>
      <Typography>
        {t('session.signedInAs', { name: user.name ?? user.email ?? '' })}
      </Typography>
      <Button onClick={() => void signOut()}>{t('session.signOut')}</Button>
    </main>
  )
}
