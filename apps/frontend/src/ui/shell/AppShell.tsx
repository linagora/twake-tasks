import {
  Avatar,
  Button,
  getInitials,
  Link,
  nameToColor,
  Typography
} from '@linagora/twake-mui'
import { useRef, useState, type ReactElement } from 'react'
import { Outlet, Link as RouterLink } from 'react-router'

import { SearchField } from '@/ui/agenda/SearchScreen'
import { QuickAdd } from '@/ui/shell/QuickAdd'
import { ShortcutsHelp, useShortcuts } from '@/ui/shell/Shortcuts'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'

export function AppShell(): ReactElement {
  const { t } = useI18n()
  const { user, signOut } = useSession()
  const email = user.email ?? ''
  const name = user.name ?? email
  const [quickAdd, setQuickAdd] = useState(false)
  const [help, setHelp] = useState(false)
  const search = useRef<HTMLInputElement>(null)
  useShortcuts({
    quickAdd: () => {
      setQuickAdd(true)
    },
    search: () => {
      search.current?.focus()
    },
    help: () => {
      setHelp(true)
    }
  })

  return (
    <>
      <header className="u-flex u-flex-wrap u-flex-items-center u-ph-2 u-pv-1">
        <Link component={RouterLink} to="/" variant="h5" underline="none">
          {t('app.name')}
        </Link>
        <nav className="u-flex u-flex-wrap u-ml-2 u-ml-0-m u-w-100-m u-mv-half">
          {(['today', 'upcoming', 'mine'] as const).map(view => (
            <Link
              key={view}
              component={RouterLink}
              to={`/${view}`}
              className="u-mr-1"
            >
              {t(`agenda.${view}`)}
            </Link>
          ))}
          <Link component={RouterLink} to="/filters" className="u-mr-1">
            {t('filters.title')}
          </Link>
          <Link component={RouterLink} to="/notifications" className="u-mr-1">
            {t('notifications.title')}
          </Link>
        </nav>
        <SearchField inputRef={search} />
        <Button
          className="u-ml-1 u-ml-0-m u-mr-1 u-mv-half"
          onClick={() => {
            setQuickAdd(true)
          }}
        >
          {t('quickAdd.title')}
        </Button>
        <Avatar
          size="s"
          color={nameToColor(name) ?? 'sunrise'}
          className="u-mr-half"
          aria-hidden
        >
          {getInitials(name, email)}
        </Avatar>
        <Typography className="u-mr-1">{name}</Typography>
        <Button variant="text" onClick={() => void signOut()}>
          {t('session.signOut')}
        </Button>
      </header>
      {quickAdd && (
        <QuickAdd
          onClose={() => {
            setQuickAdd(false)
          }}
        />
      )}
      {help && (
        <ShortcutsHelp
          onClose={() => {
            setHelp(false)
          }}
        />
      )}
      <Outlet />
    </>
  )
}
