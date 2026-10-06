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
import { signInDestination } from '@/ui/session/signInDestination'
import { SignInScreen } from '@/ui/session/SignInScreen'

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

type Wait = 'short' | 'slow' | 'timeout'

const SLOW_MS = 3000
// Under twake-oidc's 10s discovery timeout, which ends in a plain failure.
const TIMEOUT_MS = 8000
const FADE_MS = 200

const waitAt = (now: number): Wait =>
  now >= TIMEOUT_MS ? 'timeout' : now >= SLOW_MS ? 'slow' : 'short'

// Counted from the navigation, since the page showed the same screen first.
const sinceNavigation = (): number =>
  typeof performance.getEntriesByType === 'function' &&
  performance.getEntriesByType('navigation').length > 0
    ? performance.now()
    : 0

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
  const [wait, setWait] = useState(() => waitAt(sinceNavigation()))
  const [destination] = useState(() => signInDestination(window.location))
  const [screenGone, setScreenGone] = useState(false)
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

  const pending = state.status === 'pending'
  useEffect(() => {
    if (!pending) return
    const now = sinceNavigation()
    const timers = [
      setTimeout(() => {
        setWait(waitAt(SLOW_MS))
      }, SLOW_MS - now),
      setTimeout(() => {
        setWait(waitAt(TIMEOUT_MS))
      }, TIMEOUT_MS - now)
    ]
    return () => {
      timers.forEach(clearTimeout)
    }
  }, [pending])

  const signedIn = state.status === 'signedIn'
  useEffect(() => {
    if (!signedIn) return
    const timer = setTimeout(() => {
      setScreenGone(true)
    }, FADE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [signedIn])

  useEffect(() => {
    if (!signedIn) return
    return session.onEndedElsewhere(() => void session.signIn())
  }, [session, signedIn])

  const signIn = () => {
    session.signIn().then(
      user => {
        if (user) setState({ status: 'signedIn', user })
      },
      (error: unknown) => {
        console.error('Sign-in failed:', error)
      }
    )
  }

  const status =
    wait === 'slow'
      ? t('session.slow')
      : destination?.kind === 'task'
        ? t('session.opening.task', { key: destination.key })
        : destination?.kind === 'board'
          ? t('session.opening.board')
          : t('session.signingIn')

  return (
    <>
      {state.status === 'signedIn' && (
        <SessionContext value={{ user: state.user, signOut: session.signOut }}>
          {children}
        </SessionContext>
      )}
      {!screenGone && (
        <SignInScreen
          phase={
            !signedIn && wait === 'timeout'
              ? 'timeout'
              : state.status === 'failed'
                ? 'failed'
                : 'waiting'
          }
          status={status}
          leaving={signedIn}
          onRetry={() => {
            window.location.reload()
          }}
          onSignIn={signIn}
        />
      )}
    </>
  )
}
