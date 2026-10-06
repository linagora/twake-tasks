import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography
} from '@linagora/twake-mui'
import { useId, type ReactElement } from 'react'

import type { Shelf } from '@/application/boards'
import type { Board, Task } from '@/domain/board'
import { useBoardChange, useHiddenTasks } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

export function RemoveTask({
  task,
  boardId,
  onRemoved
}: {
  task: Task
  boardId: string
  onRemoved: () => void
}): ReactElement {
  const { t } = useI18n()
  const remove = useBoardChange(boardId, (api, shelf: Shelf) =>
    shelf === 'archived'
      ? api.archiveTask(boardId, task.id)
      : api.trashTask(boardId, task.id)
  )
  return (
    <>
      {remove.isError && (
        <Typography role="alert" className="u-mr-auto">
          {t('archive.failed')}
        </Typography>
      )}
      {(['archived', 'trash'] as const).map(shelf => (
        <Button
          key={shelf}
          variant="text"
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate(shelf, { onSuccess: onRemoved })
          }}
        >
          {t(shelf === 'archived' ? 'archive.archive' : 'archive.delete')}
        </Button>
      ))}
    </>
  )
}

export function ShelfDialog({
  board,
  shelf,
  onClose
}: {
  board: Board
  shelf: Shelf
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const hidden = useHiddenTasks(board.id, shelf)
  const restore = useBoardChange(board.id, (api, taskId: string) =>
    api.restoreTask(board.id, taskId)
  )
  const editable = board.role !== 'viewer' && !board.archived

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth>
      <DialogTitle id={titleId}>
        {t(shelf === 'archived' ? 'archive.archivedTasks' : 'archive.trash')}
      </DialogTitle>
      <DialogContent>
        {shelf === 'trash' && (
          <Typography variant="caption">{t('archive.retention')}</Typography>
        )}
        {(hidden.isError || restore.isError) && (
          <Typography role="alert">{t('archive.failed')}</Typography>
        )}
        {hidden.data?.length === 0 && (
          <Typography className="u-mt-1">{t('archive.empty')}</Typography>
        )}
        <ul className="u-mt-1">
          {hidden.data?.map(task => (
            <li
              key={task.id}
              aria-label={`${task.key} ${task.title}`}
              className="u-flex u-flex-items-center u-mb-half"
            >
              <Typography className="u-mr-auto">{`${task.key} ${task.title}`}</Typography>
              {editable && (
                <Button
                  variant="text"
                  disabled={restore.isPending}
                  onClick={() => {
                    restore.mutate(task.id)
                  }}
                >
                  {t('archive.restore')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {t('sharing.close')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
