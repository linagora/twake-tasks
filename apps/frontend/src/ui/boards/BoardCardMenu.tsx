import {
  Archive,
  Dots,
  Icon,
  Palette,
  Pen,
  Restore,
  Star,
  StarOutline
} from '@linagora/twake-icons'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  TextField
} from '@linagora/twake-mui'
import { useId, useState, type ElementType, type ReactElement } from 'react'

import { IconMenuItem } from '@/ds/IconMenuItem'
import type { BoardSummary } from '@/domain/board'
import { BackgroundDialog } from '@/ui/boards/Backgrounds'
import { ArchiveBoardDialog } from '@/ui/boards/BoardMenu'
import {
  useRenameBoard,
  useSetBoardArchived,
  useSetFavorite
} from '@/ui/boards/queries'
import { focusOnMount } from '@/ui/focusOnMount'
import { useI18n } from '@/ui/i18n/useI18n'

type Next = 'rename' | 'archive' | 'background'

/** The actions on a board, from its card in the list of boards. */
export function BoardCardMenu({
  board
}: {
  board: BoardSummary
}): ReactElement {
  const { t } = useI18n()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  // A dialog opens once the menu is gone, which gives the focus back to its
  // button first.
  const [next, setNext] = useState<Next | null>(null)
  const [dialog, setDialog] = useState<Next | null>(null)
  const setFavorite = useSetFavorite()
  const archive = useSetBoardArchived()
  const admin = board.role === 'admin'
  const item = (icon: ElementType, label: string, action: () => void) => (
    <IconMenuItem
      icon={icon}
      onClick={() => {
        setAnchor(null)
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
        onClose={() => {
          setAnchor(null)
        }}
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
        {item(
          board.favorite ? Star : StarOutline,
          t(board.favorite ? 'boards.removeFavorite' : 'boards.addFavorite'),
          () => {
            setFavorite.mutate({
              boardId: board.id,
              favorite: !board.favorite
            })
          }
        )}
        {admin &&
          !board.archived &&
          item(Palette, t('background.change'), () => {
            setNext('background')
          })}
        {admin &&
          !board.archived &&
          !board.inbox &&
          item(Pen, t('board.rename'), () => {
            setNext('rename')
          })}
        {admin &&
          !board.inbox &&
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
      {dialog === 'background' && (
        <BackgroundDialog
          board={board}
          onClose={() => {
            setDialog(null)
          }}
        />
      )}
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
          const next = name.trim()
          if (next === board.name) onClose()
          else rename.mutate(next, { onSuccess: onClose })
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
            {t('section.cancel')}
          </Button>
          <Button type="submit" disabled={rename.isPending || !name.trim()}>
            {t('board.renameSave')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
