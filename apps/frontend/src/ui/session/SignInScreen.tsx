import { Button } from '@linagora/twake-mui'
import { useLayoutEffect, useRef, type ReactElement } from 'react'

import { useI18n } from '@/ui/i18n/useI18n'

export type SignInPhase = 'waiting' | 'failed' | 'timeout'

export interface SignInScreenProps {
  phase: SignInPhase
  status: string
  leaving: boolean
  onRetry: () => void
  onSignIn: () => void
}

const checkAnimation = (check: Element | null): Animation | undefined =>
  check && 'getAnimations' in check ? check.getAnimations()[0] : undefined

export function SignInScreen({
  phase,
  status,
  leaving,
  onRetry,
  onSignIn
}: SignInScreenProps): ReactElement {
  const { t } = useI18n()
  const check = useRef<SVGPathElement>(null)

  // index.html draws this screen before any script runs: carry on from the
  // same point of its loop so the check mark does not jump.
  useLayoutEffect(() => {
    const page = document.getElementById('splash')
    const time = checkAnimation(
      page?.querySelector('.splash-check') ?? null
    )?.currentTime
    const mine = checkAnimation(check.current)
    if (mine && typeof time === 'number') mine.currentTime = time
    page?.remove()
  }, [])

  const classes = ['splash']
  if (phase !== 'waiting') classes.push('splash-stopped')
  if (leaving) classes.push('splash-leaving')

  return (
    <div className={classes.join(' ')} aria-hidden={leaving || undefined}>
      <svg
        className="splash-icon"
        viewBox="0 0 13 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M8 0H1.6C.72 0 .008.72.008 1.6L0 14.4c0 .88.712 1.6 1.592 1.6H11.2c.88 0 1.6-.72 1.6-1.6V4.8zm3.2 14.4H1.6V1.6h5.6v4h4z" />
        <path
          ref={check}
          className="splash-check"
          d="M3.29 9.4 5.55 11.66 9.52 7.71"
        />
      </svg>
      {phase === 'waiting' ? (
        <>
          <p className="splash-name">{t('app.name')}</p>
          <p className="splash-status" role="status">
            {status}
          </p>
        </>
      ) : (
        <>
          <h1 className="splash-title">{t(`session.${phase}.title`)}</h1>
          <p className="splash-hint">{t(`session.${phase}.hint`)}</p>
          <div className="splash-actions">
            <Button variant="contained" onClick={onRetry}>
              {t('session.retry')}
            </Button>
            <Button variant="text" onClick={onSignIn}>
              {t('session.backToSignIn')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
