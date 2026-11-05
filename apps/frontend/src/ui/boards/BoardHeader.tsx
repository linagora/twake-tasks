import { Share } from '@linagora/twake-icons'
import { Alert, Button, Chip, Tooltip } from '@linagora/twake-mui'
import { useRef, useState, type ReactElement } from 'react'
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
import {
  BoardFilterBar,
  BoardFilterButton,
  useBoardFilter,
  useFilterShortcut
} from '@/ui/boards/BoardFilter'
import { useBoardBackground } from '@/ui/boards/Backgrounds'
import { BoardMenu } from '@/ui/boards/BoardMenu'
import { BoardTitle } from '@/ui/boards/BoardTitle'
import { PageCrumbs, type Origin } from '@/ui/boards/Crumbs'
import { criteriaCount } from '@/ui/boards/taskFilter'
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
  shareButton,
  cover
}: {
  board: Board
  /** Where its breadcrumb starts, which then titles the page. */
  origin?: Origin | undefined
  /** Off in an embed, whose host shares the project: no Share, read-only avatars. */
  shareButton: boolean
  /** Off in an embed, as in Twake Space: the board shows without its cover. */
  cover: boolean
}): ReactElement {
  const { t } = useI18n()
  const picture = useBoardBackground(board, cover)
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
  const [filter] = useBoardFilter()
  const activeCriteria = criteriaCount(filter)
  const [filtering, setFiltering] = useState(activeCriteria > 0)
  const filterText = useRef<HTMLInputElement>(null)
  const startFiltering = () => {
    setFiltering(true)
    requestAnimationFrame(() => filterText.current?.focus())
  }
  // Progress counts the whole board, and its counts open the Kanban
  // filtered: the bar opens to show that filter.
  const filterable = board.layout !== 'progress'
  const filtered = filterable && activeCriteria > 0
  const [wasFiltered, setWasFiltered] = useState(filtered)
  if (wasFiltered !== filtered) {
    setWasFiltered(filtered)
    if (filtered) setFiltering(true)
  }
  useFilterShortcut(shareButton && filterable ? startFiltering : undefined)

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
      {filterable && (
        <BoardFilterButton
          count={activeCriteria}
          open={filtering}
          shortcut={shareButton}
          onClick={() => {
            if (filtering) setFiltering(false)
            else startFiltering()
          }}
        />
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
          picture={picture}
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
      {filtering && filterable && (
        <BoardFilterBar
          board={board}
          onClose={() => {
            setFiltering(false)
          }}
          saveable={shareButton}
          textRef={filterText}
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
