import { Share } from '@linagora/twake-icons'
import { Alert, Button, Chip, Tooltip, Typography } from '@linagora/twake-mui'
import { useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'

import type { Shelf } from '@/application/boards'
import { BoardHero } from '@/ds/BoardHero'
import {
  CountUp,
  HeroStat,
  HeroStats,
  ProgressSegments
} from '@/ds/HeroNumbers'
import { Icon } from '@/ds/Icon'
import { PhoneIconButton } from '@/ds/PageHeader'
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
import { Crumbs, type Origin } from '@/ui/boards/Crumbs'
import { localToday, shortDay } from '@/ui/boards/dueLabel'
import { boardNumbers, type BoardNumbers } from '@/ui/boards/progress'
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

  const people = (
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
    </>
  )
  const share = shareButton && (
    // Where the board cannot be shared, it lists its members and says why.
    <Tooltip title={whyNot ?? ''} describeChild>
      <PhoneIconButton
        startIcon={<Icon icon={Share} />}
        aria-haspopup="dialog"
        onClick={() => {
          if (shareable) setSharing(true)
          else setListing(true)
        }}
      >
        {t('sharing.share')}
      </PhoneIconButton>
    </Tooltip>
  )

  const numbers = boardNumbers(board, localToday())
  const title = (
    <BoardTitle
      board={board}
      renaming={renaming}
      onRename={setRenaming}
      bare={Boolean(origin)}
    />
  )

  return (
    <>
      <BoardHero
        picture={picture}
        title={
          origin ? (
            <Crumbs
              label={t('page.breadcrumb')}
              origin={origin}
              current={title}
              // A heading would take the name of the field that renames it.
              heading={!renaming}
            />
          ) : (
            title
          )
        }
        // From the tasks the board has loaded.
        numbers={numbers.counted > 0 && <HeroNumbers numbers={numbers} />}
        late={numbers.late > 0 && <LateCount late={numbers.late} />}
        people={people}
        share={share}
        filter={
          // Kept, disabled, where it cannot filter: the buttons hold their place.
          <BoardFilterButton
            count={filterable ? activeCriteria : 0}
            open={filtering && filterable}
            shortcut={shareButton && filterable}
            disabled={!filterable}
            onClick={() => {
              if (filtering) setFiltering(false)
              else startFiltering()
            }}
          />
        }
        // After Share, as the list and grid switch of Twake Drive.
        views={<LayoutSwitch board={board} />}
        menu={
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
        }
      />
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

function HeroNumbers({ numbers }: { numbers: BoardNumbers }): ReactElement {
  const { t, lang } = useI18n()
  const share = (count: number) => count / numbers.counted
  const percent = new Intl.NumberFormat(lang, {
    style: 'percent',
    maximumFractionDigits: 0
  })
  return (
    <>
      <HeroStats label={t('hero.numbers')}>
        <HeroStat
          value={<CountUp value={numbers.open} />}
          label={t('hero.open', { smart_count: numbers.open })}
        />
        <HeroStat
          value={<CountUp value={numbers.late} />}
          label={t('hero.late', { smart_count: numbers.late })}
          tone={numbers.late > 0 ? 'error' : undefined}
        />
        <HeroStat
          value={
            <CountUp
              value={Math.round(share(numbers.done) * 100)}
              format={value => percent.format(value / 100)}
            />
          }
          label={t('hero.done')}
        />
        {numbers.nextDue && (
          <HeroStat
            before
            value={shortDay(numbers.nextDue, lang)}
            label={t('hero.nextDue')}
          />
        )}
      </HeroStats>
      <ProgressSegments
        label={t('hero.progress')}
        text={t('hero.progressText', {
          done: numbers.done,
          started: numbers.started,
          late: numbers.late
        })}
        done={share(numbers.done)}
        started={share(numbers.started)}
        late={share(numbers.late)}
      />
    </>
  )
}

function LateCount({ late }: { late: number }): ReactElement {
  const { t } = useI18n()
  return (
    <Typography variant="body2" color="error" noWrap>
      <strong>{late}</strong> {t('hero.late', { smart_count: late })}
    </Typography>
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
