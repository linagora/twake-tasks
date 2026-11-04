import { Button } from '@linagora/twake-mui'
import { useLayoutEffect, useState, type ReactElement } from 'react'

import { ApiError, type NotificationKind } from '@/application/boards'
import projectIcon from '@/assets/project.svg'
import workplaceLogo from '@/assets/twake-workplace.svg'
import { useI18n } from '@/ui/i18n/useI18n'

const KINDS: readonly string[] = [
  'assigned',
  'mentioned',
  'reminder',
  'changes',
  'comments'
] satisfies NotificationKind[]

const isKind = (value: string | null): value is NotificationKind =>
  KINDS.includes(value ?? '')

const isChoice = (value: string | null): value is NotificationKind | 'all' =>
  value === 'all' || isKind(value)

type Phase = 'asking' | 'saving' | 'done' | 'failed' | 'invalid'

/**
 * The page of an email's unsubscribe link, shown without signing in. It asks
 * first: mail scanners open the links of an email, and must not unsubscribe.
 */
export function UnsubscribeScreen({
  search,
  unsubscribe
}: {
  search: string
  unsubscribe: (token: string, kind: NotificationKind | 'all') => Promise<void>
}): ReactElement {
  const { t } = useI18n()
  const params = new URLSearchParams(search)
  const token = params.get('token')
  const kind = params.get('kind')
  const [phase, setPhase] = useState<Phase>(
    token && isChoice(kind) ? 'asking' : 'invalid'
  )

  useLayoutEffect(() => {
    document.getElementById('splash')?.remove()
  }, [])

  const subject = isKind(kind)
    ? t('unsubscribe.about', { kind: t(`notificationSettings.kinds.${kind}`) })
    : t('unsubscribe.all')
  const [title, hint] = {
    asking: [t('unsubscribe.ask', { subject }), t('unsubscribe.askHint')],
    saving: [t('unsubscribe.ask', { subject }), t('unsubscribe.askHint')],
    done: [t('unsubscribe.done', { subject }), t('unsubscribe.doneHint')],
    failed: [t('notificationSettings.saveFailed'), t('unsubscribe.retryHint')],
    invalid: [t('unsubscribe.invalid'), t('unsubscribe.invalidHint')]
  }[phase]

  const confirm = () => {
    if (!token || !isChoice(kind)) return
    setPhase('saving')
    unsubscribe(token, kind).then(
      () => {
        setPhase('done')
      },
      (error: unknown) => {
        setPhase(
          error instanceof ApiError && error.status === 404
            ? 'invalid'
            : 'failed'
        )
      }
    )
  }

  return (
    <main className="splash">
      <span className="splash-icon" aria-hidden="true">
        <img src={projectIcon} alt="" />
      </span>
      <h1 className="splash-title">{title}</h1>
      <p className="splash-hint" role={phase === 'done' ? 'status' : undefined}>
        {hint}
      </p>
      <div className="splash-actions">
        {(phase === 'asking' || phase === 'saving' || phase === 'failed') && (
          <Button
            variant="contained"
            disabled={phase === 'saving'}
            onClick={confirm}
          >
            {t('unsubscribe.confirm')}
          </Button>
        )}
        <Button variant="text" href="/settings#notifications">
          {t('unsubscribe.settings')}
        </Button>
      </div>
      <img
        className="splash-workplace"
        src={workplaceLogo}
        alt="Twake Workplace"
      />
    </main>
  )
}
