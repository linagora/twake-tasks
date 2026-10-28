import { Share } from '@linagora/twake-icons'
import { Alert, Button, Chip, Tooltip } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'

import type { Shelf } from '@/application/boards'
import { Icon } from '@/ds/Icon'
import { PageHeader, UnavailableButton } from '@/ds/PageHeader'
import {
  isAdmin,
  isArchivable,
  isRenamable,
  isShareable,
  whyNotShareable,
  type Board,
  type NotShareable
} from '@/domain/board'
import { BoardMenu } from '@/ui/boards/BoardMenu'
import { BoardTitle } from '@/ui/boards/BoardTitle'
import { PageCrumbs, type Origin } from '@/ui/boards/Crumbs'
import { LayoutSwitch } from '@/ui/boards/Layouts'
import { MembersDialog, MemberStack } from '@/ui/boards/MembersDialog'
import { MoveBoardDialog, useMoveTargets } from '@/ui/boards/MoveBoardDialog'
import { useSetBoardArchived } from '@/ui/queries/boards'
import { ShareDialog } from '@/ui/boards/ShareDialog'
import { useI18n } from '@/ui/i18n/useI18n'

const NOT_SHAREABLE = {
  personal: 'sharing.personalBoard',
  managed: 'sharing.managedBoard',
  archived: 'sharing.archivedBoard',
  notAdmin: 'sharing.adminOnly'
} as const satisfies Record<NotShareable, string>

export function BoardHeader({
  board,
  origin,
  shareButton
}: {
  board: Board
  /** Where its breadcrumb starts, which then titles the page. */
  origin?: Origin | undefined
  /** Off in an embed, whose host shares the project: no Share, read-only avatars. */
  shareButton: boolean
}): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const openShelf = (shelf: Shelf): void => {
    void navigate(shelf)
  }
  const shareable = isShareable(board)
  const [sharing, setSharing] = useState(false)
  const [listing, setListing] = useState(false)
  const notShareable = whyNotShareable(board)
  const whyNot =
    notShareable &&
    t(NOT_SHAREABLE[notShareable], { space: board.project.name })
  const [moving, setMoving] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const renamable = isRenamable(board)
  const targets = useMoveTargets(board)
  const movable = shareable && targets.length > 0

  const headerActions = (
    <>
      {!isAdmin(board.role) && (
        <Tooltip
          title={
            board.archived
              ? t('archive.boardArchived')
              : t(`board.${board.role}Hint`)
          }
          describeChild
        >
          <Chip
            variant="outlined"
            size="small"
            label={t(`sharing.roles.${board.role}`)}
            aria-haspopup="dialog"
            onClick={() => {
              setListing(true)
            }}
          />
        </Tooltip>
      )}
      <MemberStack
        members={board.members}
        invited={board.invited}
        onClick={() => {
          if (shareable && shareButton) setSharing(true)
          else setListing(true)
        }}
      />
      {!shareButton ? null : shareable ? (
        <Button
          variant="secondary"
          startIcon={<Icon icon={Share} />}
          onClick={() => {
            setSharing(true)
          }}
        >
          {t('sharing.share')}
        </Button>
      ) : (
        <Tooltip title={whyNot ?? ''} describeChild>
          <UnavailableButton
            variant="secondary"
            startIcon={<Icon icon={Share} />}
            aria-disabled="true"
            disableRipple
          >
            {t('sharing.share')}
          </UnavailableButton>
        </Tooltip>
      )}
      {/* After Share, as the list and grid switch of Twake Drive. */}
      <LayoutSwitch board={board} />
      <BoardMenu
        board={board}
        onOpenShelf={openShelf}
        onRename={
          renamable
            ? () => {
                setRenaming(true)
              }
            : undefined
        }
        onMove={
          movable
            ? () => {
                setMoving(true)
              }
            : undefined
        }
      />
    </>
  )

  return (
    <>
      {origin ? (
        <PageCrumbs
          origin={origin}
          current={
            <BoardTitle
              board={board}
              renaming={renaming}
              onRename={setRenaming}
              bare
            />
          }
          // A heading would take the name of the field that renames it.
          heading={!renaming}
          actions={headerActions}
        />
      ) : (
        <PageHeader
          title={
            <BoardTitle
              board={board}
              renaming={renaming}
              onRename={setRenaming}
            />
          }
          actions={headerActions}
        />
      )}
      {board.archived && <ArchivedBanner board={board} />}
      {sharing && (
        <ShareDialog
          board={board}
          onClose={() => {
            setSharing(false)
          }}
        />
      )}
      {listing && (
        <MembersDialog
          board={board}
          reason={whyNot}
          onClose={() => {
            setListing(false)
          }}
        />
      )}
      {moving && (
        <MoveBoardDialog
          board={board}
          onClose={() => {
            setMoving(false)
          }}
        />
      )}
    </>
  )
}

function ArchivedBanner({ board }: { board: Board }): ReactElement {
  const { t } = useI18n()
  const unarchive = useSetBoardArchived()
  return (
    <Alert
      severity={unarchive.isError ? 'error' : 'info'}
      className="u-mb-1"
      action={
        isArchivable(board) && (
          <Button
            variant="text"
            size="small"
            disabled={unarchive.isPending}
            onClick={() => {
              unarchive.mutate({ boardId: board.id, archived: false })
            }}
          >
            {t('archive.unarchive')}
          </Button>
        )
      }
    >
      {t(unarchive.isError ? 'archive.failed' : 'archive.boardArchived')}
    </Alert>
  )
}
