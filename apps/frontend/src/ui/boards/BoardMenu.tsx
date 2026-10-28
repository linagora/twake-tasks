import {
  Archive,
  Check,
  Dots,
  FolderMoveto,
  Pen,
  Restore,
  Stack,
  Trash
} from '@linagora/twake-icons'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Menu,
  Typography
} from '@linagora/twake-mui'
import { useId, useState, type ElementType, type ReactElement } from 'react'

import type { Shelf } from '@/application/boards'
import { Icon } from '@/ds/Icon'
import { IconMenuItem } from '@/ds/IconMenuItem'
import { Toast } from '@/ds/Toast'
import {
  isArchivable,
  isManageable,
  isRenamable,
  type Board
} from '@/domain/board'
import { useSetBoardArchived, useSetLayout } from '@/ui/boards/queries'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'

export function BoardMenu({
  board,
  onOpenShelf,
  onMove,
  onRename
}: {
  board: Board
  onOpenShelf: (shelf: Shelf) => void
  onMove?: (() => void) | undefined
  onRename?: (() => void) | undefined
}): ReactElement {
  const { t } = useI18n()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  // The editor and the dialog open once the menu is gone, which gives the focus
  // back to its button first: the editor would lose the focus and close at once
  const [next, setNext] = useState<'rename' | 'archive' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [archivedNotice, setArchivedNotice] = useState(false)
  const setLayout = useSetLayout(board.id)
  const archive = useSetBoardArchived()
  const archivable = isArchivable(board)
  const close = (): void => {
    setAnchor(null)
  }
  const item = (icon: ElementType, label: string, action: () => void) => (
    <IconMenuItem
      icon={icon}
      onClick={() => {
        close()
        action()
      }}
    >
      {label}
    </IconMenuItem>
  )

  return (
    <>
      {/* As tall as the other actions, so that the breadcrumb strip keeps its height. */}
      <IconButton
        size="medium"
        aria-label={t('board.menu')}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={event => {
          setAnchor(event.currentTarget)
        }}
      >
        <Icon icon={Dots} />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={close}
        slotProps={{
          transition: {
            onExited: () => {
              setNext(null)
              if (next === 'rename') onRename?.()
              if (next === 'archive') setConfirming(true)
            }
          }
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {isManageable(board) &&
          board.layout !== board.defaultLayout &&
          item(Check, t('layout.useAsDefault'), () => {
            setLayout.mutate({ layout: board.layout, everyone: true })
          })}
        {item(Stack, t('archive.archivedTasks'), () => {
          onOpenShelf('archived')
        })}
        {item(Trash, t('archive.trash'), () => {
          onOpenShelf('trash')
        })}
        {archivable && <Divider />}
        {isRenamable(board) &&
          onRename &&
          item(Pen, t('board.rename'), () => {
            setNext('rename')
          })}
        {onMove && item(FolderMoveto, t('moveBoard.action'), onMove)}
        {archivable &&
          item(
            board.archived ? Restore : Archive,
            t(
              board.archived ? 'archive.unarchiveBoard' : 'archive.archiveBoard'
            ),
            () => {
              if (board.archived) {
                setArchivedNotice(false)
                archive.mutate({ boardId: board.id, archived: false })
              } else setNext('archive')
            }
          )}
      </Menu>
      {confirming && (
        <ArchiveBoardDialog
          name={board.name}
          onCancel={() => {
            setConfirming(false)
          }}
          onArchive={() => {
            setConfirming(false)
            archive.mutate(
              { boardId: board.id, archived: true },
              {
                onSuccess: () => {
                  setArchivedNotice(true)
                }
              }
            )
          }}
        />
      )}
      {/* Unarchived elsewhere, from the banner, the notice has nothing to undo. */}
      {archivedNotice && board.archived ? (
        <BoardArchivedNotice
          board={board}
          undo={archive}
          onClose={() => {
            setArchivedNotice(false)
          }}
        />
      ) : (
        archive.isError && (
          <Toast
            open
            autoHideDuration={6000}
            onClose={(_, reason) => {
              if (reason !== 'clickaway') archive.reset()
            }}
          >
            <Alert severity="error">{t('archive.failed')}</Alert>
          </Toast>
        )
      )}
    </>
  )
}

function ArchiveBoardDialog({
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

function BoardArchivedNotice({
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
