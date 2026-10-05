import {
  Avatar,
  Button,
  getInitials,
  Link,
  nameToColor,
  Typography
} from '@linagora/twake-mui'
import type { ReactElement } from 'react'
import { Outlet, Link as RouterLink } from 'react-router'

import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'

export function AppShell(): ReactElement {
  const { t } = useI18n()
  const { user, signOut } = useSession()
  const email = user.email ?? ''
  const name = user.name ?? email

  return (
    <>
      <header className="u-flex u-flex-items-center u-ph-2 u-pv-1">
        <Link component={RouterLink} to="/" variant="h5" underline="none">
          {t('app.name')}
        </Link>
        <Avatar
          size="s"
          color={nameToColor(name) ?? 'sunrise'}
          className="u-ml-auto u-mr-half"
          aria-hidden
        >
          {getInitials(name, email)}
        </Avatar>
        <Typography className="u-mr-1">{name}</Typography>
        <Button variant="text" onClick={() => void signOut()}>
          {t('session.signOut')}
        </Button>
      </header>
      <Outlet />
    </>
  )
}
