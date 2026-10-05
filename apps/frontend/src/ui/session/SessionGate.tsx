import { Button, CircularProgress, Typography } from '@linagora/twake-mui'
import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'

import type { SessionService, User } from '@/application/session'
import { useI18n } from '@/ui/i18n/useI18n'

export interface Session {
  user: User
  signOut: () => Promise<void>
}

const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = use(SessionContext)
  if (!session) throw new Error('useSession must be used inside SessionGate')
  return session
}

type GateState =
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'signedIn'; user: User }

export interface SessionGateProps {
  session: SessionService
  children: ReactNode
}

export function SessionGate({
  session,
  children
}: SessionGateProps): ReactElement {
  const { t } = useI18n()
  const [state, setState] = useState<GateState>({ status: 'pending' })
  // StrictMode runs effects twice; a second start would find the sign-in spent
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    session.start().then(
      user => {
        if (user) setState({ status: 'signedIn', user })
      },
      (error: unknown) => {
        console.error('Sign-in failed:', error)
        setState({ status: 'failed' })
      }
    )
  }, [session])

  const signedIn = state.status === 'signedIn'
  useEffect(() => {
    if (!signedIn) return
    return session.onEndedElsewhere(() => void session.signIn())
  }, [session, signedIn])

  if (state.status === 'failed') {
    return (
      <main className="u-p-2">
        <Typography>{t('session.failed')}</Typography>
        <Button onClick={() => void session.signIn()}>
          {t('session.retry')}
        </Button>
      </main>
    )
  }
  if (state.status === 'pending') {
    return <CircularProgress aria-label={t('session.signingIn')} />
  }
  return (
    <SessionContext value={{ user: state.user, signOut: session.signOut }}>
      {children}
    </SessionContext>
  )
}
