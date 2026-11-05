import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography
} from '@linagora/twake-mui'
import { useId, type ReactElement } from 'react'

import { Toast } from '@/ds/Toast'
import type { Board } from '@/domain/board'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'
import type { useSetBoardArchived } from '@/ui/queries/boards'

export function ArchiveBoardDialog({
  name,
  onCancel,
  onArchive
}: {
  name: string
  onCancel: () => void
  onArchive: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  return (
    <Dialog open onClose={onCancel} aria-labelledby={titleId} size="small">
      <DialogTitle id={titleId}>
        {t('archive.confirmBoardTitle', { name })}
      </DialogTitle>
      <DialogContent>
        <Typography>{t('archive.confirmBoardText')}</Typography>
      </DialogContent>
      <DialogActions>
        <Button variant="text" ref={focusOnMount} onClick={onCancel}>
          {t('archive.cancel')}
        </Button>
        <Button onClick={onArchive}>{t('archive.archiveBoard')}</Button>
      </DialogActions>
    </Dialog>
  )
}

export function BoardArchivedNotice({
  board,
  undo,
  onClose
}: {
  board: Board
  undo: ReturnType<typeof useSetBoardArchived>
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const labelId = useId()
  return (
    <Toast
      open
      autoHideDuration={undo.isError ? null : 6000}
      onClose={(_, reason) => {
        if (reason !== 'clickaway') onClose()
      }}
    >
      <Alert
        severity={undo.isError ? 'error' : 'info'}
        role={undo.isError ? 'alert' : 'status'}
        aria-labelledby={labelId}
        action={
          <Button
            variant="text"
            size="small"
            disabled={undo.isPending}
            onClick={() => {
              undo.mutate(
                { boardId: board.id, archived: false },
                { onSuccess: onClose }
              )
            }}
          >
            {t('archive.undo')}
          </Button>
        }
      >
        <span id={labelId}>
          {undo.isError
            ? t('archive.failed')
            : t('archive.boardArchivedToast', { name: board.name })}
        </span>
      </Alert>
    </Toast>
  )
}
