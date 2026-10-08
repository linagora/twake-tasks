import { Archive, Trash } from '@linagora/twake-icons'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Typography
} from '@linagora/twake-mui'
import { createContext, useContext, useId, type ReactElement } from 'react'

import type { Shelf } from '@/application/boards'
import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import type { Board, Task } from '@/domain/board'
import { useBoardChange, useHiddenTasks } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

export interface Removal {
  task: Task
  shelf: Shelf
}

// The panel that removes a task closes with it, so the board shows the notice.
export const RemovalNotices = createContext<(removal: Removal) => void>(
  () => undefined
)

export function useRemoveTask(boardId: string, task: Task) {
  const announce = useContext(RemovalNotices)
  return useBoardChange(boardId, async (api, shelf: Shelf) => {
    await (shelf === 'archived'
      ? api.archiveTask(boardId, task.id)
      : api.trashTask(boardId, task.id))
    announce({ task, shelf })
  })
}

export function RemovalNotice({
  board,
  removal,
  onOpenShelf,
  onClose
}: {
  board: Board
  removal: Removal
  onOpenShelf: (shelf: Shelf) => void
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const labelId = useId()
  const restore = useBoardChange(board.id, (api, taskId: string) =>
    api.restoreTask(board.id, taskId)
  )
  const { task, shelf } = removal

  return (
    <Snackbar
      open
      autoHideDuration={restore.isError ? null : 8000}
      onClose={(_, reason) => {
        if (reason !== 'clickaway') onClose()
      }}
    >
      <Alert
        severity={restore.isError ? 'error' : 'info'}
        role={restore.isError ? 'alert' : 'status'}
        aria-labelledby={labelId}
        action={
          <>
            <Button
              variant="text"
              size="small"
              disabled={restore.isPending}
              onClick={() => {
                restore.mutate(task.id, { onSuccess: onClose })
              }}
            >
              {t('archive.undo')}
            </Button>
            <Button
              variant="text"
              size="small"
              onClick={() => {
                onClose()
                onOpenShelf(shelf)
              }}
            >
              {t(
                shelf === 'archived'
                  ? 'archive.viewArchived'
                  : 'archive.viewTrash'
              )}
            </Button>
          </>
        }
      >
        <span id={labelId}>
          {restore.isError
            ? t('archive.failed')
            : t(shelf === 'archived' ? 'archive.archived' : 'archive.trashed', {
                key: task.key
              })}
        </span>
      </Alert>
    </Snackbar>
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
        {shelf === 'trash' && hidden.data?.length !== 0 && (
          <Typography variant="caption">{t('archive.retention')}</Typography>
        )}
        {(hidden.isError || restore.isError) && (
          <Typography role="alert">{t('archive.failed')}</Typography>
        )}
        {hidden.isPending && <ListSkeleton label={t('app.loading')} rows={2} />}
        {hidden.data?.length === 0 && (
          <EmptyState
            icon={shelf === 'archived' ? Archive : Trash}
            title={t(
              shelf === 'archived'
                ? 'archive.emptyArchived'
                : 'archive.emptyTrash'
            )}
            text={t(
              shelf === 'archived'
                ? 'archive.emptyArchivedHint'
                : 'archive.retention'
            )}
          />
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
