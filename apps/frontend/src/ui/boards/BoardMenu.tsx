import {
  Archive,
  Check,
  Dots,
  FolderMoveto,
  Icon,
  Restore,
  Trash
} from '@linagora/twake-icons'
import {
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem
} from '@linagora/twake-mui'
import { useState, type ElementType, type ReactElement } from 'react'

import type { Shelf } from '@/application/boards'
import type { Board } from '@/domain/board'
import { useBoardChange, useSetLayout } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

export function BoardMenu({
  board,
  onOpenShelf,
  onMove
}: {
  board: Board
  onOpenShelf: (shelf: Shelf) => void
  onMove?: (() => void) | undefined
}): ReactElement {
  const { t } = useI18n()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const setLayout = useSetLayout(board.id)
  const archive = useBoardChange(board.id, (api, archived: boolean) =>
    api.setBoardArchived(board.id, archived)
  )
  const admin = board.role === 'admin'
  const close = (): void => {
    setAnchor(null)
  }
  const item = (icon: ElementType, label: string, action: () => void) => (
    <MenuItem
      onClick={() => {
        close()
        action()
      }}
    >
      <ListItemIcon>
        <Icon icon={icon} />
      </ListItemIcon>
      <ListItemText>{label}</ListItemText>
    </MenuItem>
  )

  return (
    <>
      <IconButton
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
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {admin &&
          !board.archived &&
          board.layout !== board.defaultLayout &&
          item(Check, t('layout.useAsDefault'), () => {
            setLayout.mutate({ layout: board.layout, everyone: true })
          })}
        {item(Archive, t('archive.archivedTasks'), () => {
          onOpenShelf('archived')
        })}
        {item(Trash, t('archive.trash'), () => {
          onOpenShelf('trash')
        })}
        {admin && !board.inbox && <Divider />}
        {onMove && item(FolderMoveto, t('moveBoard.action'), onMove)}
        {admin &&
          !board.inbox &&
          item(
            board.archived ? Restore : Archive,
            t(
              board.archived ? 'archive.unarchiveBoard' : 'archive.archiveBoard'
            ),
            () => {
              archive.mutate(!board.archived)
            }
          )}
      </Menu>
    </>
  )
}
