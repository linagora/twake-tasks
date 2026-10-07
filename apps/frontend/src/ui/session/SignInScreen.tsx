import { Button } from '@linagora/twake-mui'
import { useLayoutEffect, useRef, type ReactElement } from 'react'

import projectIcon from '@/assets/project.svg'
import workplaceLogo from '@/assets/twake-workplace.svg'
import { useI18n } from '@/ui/i18n/useI18n'

export type SignInPhase = 'waiting' | 'failed' | 'timeout'

export interface SignInScreenProps {
  phase: SignInPhase
  status: string
  leaving: boolean
  onRetry: () => void
  onSignIn: () => void
}

const growAnimation = (icon: Element | null): Animation | undefined =>
  icon && 'getAnimations' in icon ? icon.getAnimations()[0] : undefined

export function SignInScreen({
  phase,
  status,
  leaving,
  onRetry,
  onSignIn
}: SignInScreenProps): ReactElement {
  const { t } = useI18n()
  const icon = useRef<HTMLSpanElement>(null)

  // index.html draws this screen before any script runs: carry on from the
  // same point of its animation so the icon does not jump.
  useLayoutEffect(() => {
    const page = document.getElementById('splash')
    const time = growAnimation(
      page?.querySelector('.splash-icon') ?? null
    )?.currentTime
    const mine = growAnimation(icon.current)
    if (mine && typeof time === 'number') mine.currentTime = time
    page?.remove()
  }, [])

  const classes = ['splash']
  if (leaving) classes.push('splash-leaving')

  return (
    <div className={classes.join(' ')} aria-hidden={leaving || undefined}>
      <span ref={icon} className="splash-icon" aria-hidden="true">
        <img src={projectIcon} alt="" />
      </span>
      {phase === 'waiting' ? (
        <p className="splash-status" role="status">
          {status}
        </p>
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
      <img
        className="splash-workplace"
        src={workplaceLogo}
        alt="Twake Workplace"
      />
    </div>
  )
}
