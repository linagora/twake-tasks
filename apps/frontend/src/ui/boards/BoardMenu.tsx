import {
  Archive,
  Check,
  Copy,
  Dots,
  Download,
  Files,
  FolderMoveto,
  Logout,
  Palette,
  Pen,
  Restore,
  Stack,
  Trash,
  Upload
} from '@linagora/twake-icons'
import { Alert, Divider, IconButton, Menu } from '@linagora/twake-mui'
import { useState, type ElementType, type ReactElement } from 'react'
import { useNavigate, useParams } from 'react-router'

import type { Shelf } from '@/application/boards'
import { Icon } from '@/ds/Icon'
import { IconMenuItem } from '@/ds/IconMenuItem'
import { Toast } from '@/ds/Toast'
import {
  hasOwnCover,
  isArchivable,
  isEditable,
  isManageable,
  isRenamable,
  type Board
} from '@/domain/board'
import {
  ArchiveBoardDialog,
  BoardArchivedNotice
} from '@/ui/boards/ArchiveBoardDialog'
import { BackgroundDialog } from '@/ui/boards/Backgrounds'
import { ExportDialog } from '@/ui/boards/ExportDialog'
import { ImportDialog } from '@/ui/boards/ImportDialog'
import { LeaveBoardDialog } from '@/ui/boards/LeaveBoardDialog'
import { NewBoardDialog } from '@/ui/boards/NewBoardDialog'
import {
  useSetBoardArchived,
  useSetBoardTemplate,
  useSetLayout
} from '@/ui/queries/boards'
import { useI18n } from '@/ui/i18n/useI18n'
import { useSession } from '@/ui/session/SessionGate'

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
  const [next, setNext] = useState<
    | 'rename'
    | 'archive'
    | 'export'
    | 'import'
    | 'copy'
    | 'leave'
    | 'background'
    | null
  >(null)
  const [confirming, setConfirming] = useState(false)
  const [csv, setCsv] = useState<'export' | 'import' | null>(null)
  const [copying, setCopying] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [archivedNotice, setArchivedNotice] = useState(false)
  const [templateNotice, setTemplateNotice] = useState(false)
  const setLayout = useSetLayout(board.id)
  const archive = useSetBoardArchived()
  const asTemplate = useSetBoardTemplate()
  const archivable = isArchivable(board)
  const renamable = isRenamable(board)
  const navigate = useNavigate()
  const embedded = useParams().projectId !== undefined
  const { user } = useSession()
  const me = user.email?.toLowerCase()
  // A personal project is no one else's, and a space's members are the space's.
  const self =
    !embedded &&
    !board.project.personal &&
    !board.project.managed &&
    board.members.find(member => member.email.toLowerCase() === me)
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
              if (next === 'export' || next === 'import') setCsv(next)
              if (next === 'copy') setCopying(true)
              if (next === 'leave') setLeaving(true)
              if (next === 'background') setChoosing(true)
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
        <Divider />
        {item(Download, t('csv.export'), () => {
          setNext('export')
        })}
        {isEditable(board) &&
          item(Upload, t('csv.import'), () => {
            setNext('import')
          })}
        {renamable && <Divider />}
        {renamable &&
          item(Copy, t('copyBoard.action'), () => {
            setNext('copy')
          })}
        {renamable &&
          item(
            Files,
            t(board.boardTemplate ? 'boardTemplate.stop' : 'boardTemplate.use'),
            () => {
              const on = !board.boardTemplate
              setTemplateNotice(false)
              asTemplate.mutate(
                { boardId: board.id, on },
                {
                  onSuccess: () => {
                    setTemplateNotice(on)
                  }
                }
              )
            }
          )}
        {archivable && <Divider />}
        {renamable &&
          onRename &&
          item(Pen, t('board.rename'), () => {
            setNext('rename')
          })}
        {isManageable(board) &&
          !embedded &&
          item(
            Palette,
            t(hasOwnCover(board) ? 'background.change' : 'background.add'),
            () => {
              setNext('background')
            }
          )}
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
        {self && <Divider />}
        {self &&
          item(Logout, t('leave.action'), () => {
            setNext('leave')
          })}
      </Menu>
      {csv === 'export' && (
        <ExportDialog
          board={board}
          onClose={() => {
            setCsv(null)
          }}
        />
      )}
      {csv === 'import' && (
        <ImportDialog
          board={board}
          onClose={() => {
            setCsv(null)
          }}
        />
      )}
      {copying && (
        <NewBoardDialog
          copying={board}
          embedded={embedded}
          onClose={() => {
            setCopying(false)
          }}
          onCreated={copy => {
            setCopying(false)
            void navigate(`../${copy.id}`, {
              relative: 'path',
              state: { created: true }
            })
          }}
        />
      )}
      {leaving && self && (
        <LeaveBoardDialog
          board={board}
          self={self}
          onClose={() => {
            setLeaving(false)
          }}
        />
      )}
      {templateNotice && board.boardTemplate && (
        <Toast
          open
          autoHideDuration={6000}
          onClose={(_, reason) => {
            if (reason !== 'clickaway') setTemplateNotice(false)
          }}
        >
          <Alert severity="info" role="status">
            {t('boardTemplate.on', { name: board.name })}
          </Alert>
        </Toast>
      )}
      {asTemplate.isError && (
        <Toast
          open
          autoHideDuration={6000}
          onClose={(_, reason) => {
            if (reason !== 'clickaway') asTemplate.reset()
          }}
        >
          <Alert severity="error">{t('boardTemplate.failed')}</Alert>
        </Toast>
      )}
      {choosing && (
        <BackgroundDialog
          board={board}
          onClose={() => {
            setChoosing(false)
          }}
        />
      )}
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
