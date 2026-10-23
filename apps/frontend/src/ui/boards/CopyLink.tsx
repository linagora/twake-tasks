import { Icon, Link } from '@linagora/twake-icons'
import { Alert, IconButton, Tooltip } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'

import { Toast } from '@/ds/Toast'
import { useI18n } from '@/ui/i18n/useI18n'

type Outcome = 'copied' | 'failed'

/**
 * The link of a task is always the one of Tasks itself, also in TwakeSpace's
 * frame, so that it opens anywhere.
 */
export function taskUrl(
  boardId: string,
  key: string,
  expanded: boolean
): string {
  const url = new URL(
    `/boards/${encodeURIComponent(boardId)}`,
    window.location.origin
  )
  url.searchParams.set('task', key)
  if (expanded) url.searchParams.set('panel', 'full')
  return url.toString()
}

export function CopyLinkButton({
  boardId,
  taskKey,
  expanded
}: {
  boardId: string
  taskKey: string
  expanded: boolean
}): ReactElement {
  const { t } = useI18n()
  // Kept apart from the outcome so the toast keeps its message while it fades.
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>('copied')

  // Written with the clipboard of the window that was clicked: in TwakeSpace
  // the panel is in the overlay's document, which owns the user activation.
  const copy = async (button: HTMLElement) => {
    const clipboard =
      button.ownerDocument.defaultView?.navigator.clipboard ??
      navigator.clipboard
    try {
      await clipboard.writeText(taskUrl(boardId, taskKey, expanded))
      setOutcome('copied')
    } catch {
      setOutcome('failed')
    }
    setOpen(true)
  }

  return (
    <>
      <Tooltip title={t('task.copyLink')}>
        <IconButton
          size="small"
          aria-label={t('task.copyLink')}
          onClick={event => {
            void copy(event.currentTarget)
          }}
        >
          <Icon icon={Link} />
        </IconButton>
      </Tooltip>
      <Toast
        open={open}
        autoHideDuration={4000}
        onClose={() => {
          setOpen(false)
        }}
      >
        <Alert
          severity={outcome === 'failed' ? 'error' : 'success'}
          role={outcome === 'failed' ? 'alert' : 'status'}
        >
          {outcome === 'failed' ? t('task.copyFailed') : t('task.linkCopied')}
        </Alert>
      </Toast>
    </>
  )
}
