import { Icon, Plus } from '@linagora/twake-icons'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography
} from '@linagora/twake-mui'
import { useId, type ReactElement } from 'react'

import { useI18n } from '@/ui/i18n/useI18n'

/**
 * What a view says when a task is dropped in a column its board has not:
 * the task stays where it was, unless that status is added to its board.
 */
export function MissingStatusDialog({
  board,
  status,
  busy,
  failed,
  onAdd,
  onCancel
}: {
  board: string
  status: string
  busy: boolean
  failed: boolean
  onAdd: () => void
  onCancel: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  return (
    <Dialog open onClose={onCancel} aria-labelledby={titleId}>
      <DialogTitle id={titleId}>
        {t('filters.missingStatusTitle', { board, section: status })}
      </DialogTitle>
      <DialogContent>
        <Typography>
          {t('filters.missingStatusText', { board, section: status })}
        </Typography>
      </DialogContent>
      <DialogActions>
        {failed && (
          <Typography role="alert" variant="caption" color="error">
            {t('filters.addStatusFailed')}
          </Typography>
        )}
        <Button variant="text" onClick={onCancel}>
          {t('board.cancel')}
        </Button>
        <Button
          startIcon={<Icon icon={Plus} />}
          disabled={busy}
          onClick={onAdd}
        >
          {t('filters.addStatus', { board, section: status })}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
