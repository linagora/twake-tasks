import { Archive, Dots, Icon, Pen, Restore } from '@linagora/twake-icons'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Menu,
  TextField
} from '@linagora/twake-mui'
import { useId, useState, type ElementType, type ReactElement } from 'react'

import { IconMenuItem } from '@/ds/IconMenuItem'
import { isArchivable, isRenamable, type BoardSummary } from '@/domain/board'
import { ArchiveBoardDialog } from '@/ui/boards/BoardMenu'
import { useRenameBoard, useSetBoardArchived } from '@/ui/boards/queries'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'
import { SidebarPlaceMenuItem } from '@/ui/shell/SidebarSections'

/** The main actions on a board, from its card in the list of boards. */
export function BoardCardMenu({
  board
}: {
  board: BoardSummary
}): ReactElement {
  const { t } = useI18n()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  // A dialog opens once the menu is gone, which gives the focus back to its
  // button first.
  const [next, setNext] = useState<'rename' | 'archive' | null>(null)
  const [dialog, setDialog] = useState<'rename' | 'archive' | null>(null)
  const archive = useSetBoardArchived()
  const close = () => {
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
      <IconButton
        size="small"
        aria-label={t('boards.menu', { name: board.name })}
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
              setDialog(next)
              setNext(null)
            }
          }
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {!board.archived && (
          <SidebarPlaceMenuItem
            item={{ kind: 'board', id: board.id }}
            onPicked={close}
          />
        )}
        {!board.archived && isArchivable(board) && <Divider />}
        {isRenamable(board) &&
          item(Pen, t('board.rename'), () => {
            setNext('rename')
          })}
        {isArchivable(board) &&
          item(
            board.archived ? Restore : Archive,
            t(
              board.archived ? 'archive.unarchiveBoard' : 'archive.archiveBoard'
            ),
            () => {
              if (board.archived) {
                archive.mutate({ boardId: board.id, archived: false })
              } else setNext('archive')
            }
          )}
      </Menu>
      {dialog === 'rename' && (
        <RenameBoardDialog
          board={board}
          onClose={() => {
            setDialog(null)
          }}
        />
      )}
      {dialog === 'archive' && (
        <ArchiveBoardDialog
          name={board.name}
          onCancel={() => {
            setDialog(null)
          }}
          onArchive={() => {
            setDialog(null)
            archive.mutate({ boardId: board.id, archived: true })
          }}
        />
      )}
    </>
  )
}

function RenameBoardDialog({
  board,
  onClose
}: {
  board: BoardSummary
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const titleId = useId()
  const [name, setName] = useState(board.name)
  const rename = useRenameBoard(board.id)

  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} size="small">
      <form
        onSubmit={event => {
          event.preventDefault()
          const renamed = name.trim()
          if (renamed === board.name) onClose()
          else rename.mutate(renamed, { onSuccess: onClose })
        }}
      >
        <DialogTitle id={titleId}>{t('board.rename')}</DialogTitle>
        <DialogContent>
          <TextField
            label={t('board.renameName')}
            value={name}
            onChange={event => {
              setName(event.target.value)
              rename.reset()
            }}
            required
            fullWidth
            inputRef={focusOnMount}
            margin="dense"
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          {rename.isError && <p role="alert">{t('board.renameFailed')}</p>}
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={onClose}>
            {t('board.cancel')}
          </Button>
          <Button type="submit" disabled={rename.isPending || !name.trim()}>
            {t('board.renameSave')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
