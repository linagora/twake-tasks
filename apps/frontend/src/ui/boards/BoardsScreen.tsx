import {
  Alert,
  Button,
  Link,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme
} from '@linagora/twake-mui'
import { Archive, Icon, Mosaic, Plus } from '@linagora/twake-icons'
import { useId, useState, type ReactElement } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router'

import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { BoardCard, BoardChip, CardGrid, CreateCard } from '@/ds/TileGrid'
import { Toast } from '@/ds/Toast'
import {
  isArchivable,
  type BoardSummary,
  type ProjectSummary
} from '@/domain/board'
import { listBoards } from '@/domain/boardList'
import { BoardCardMenu } from '@/ui/boards/BoardCardMenu'
import { NewBoardDialog } from '@/ui/boards/NewBoardDialog'
import { PeopleAvatars } from '@/ui/boards/MembersDialog'
import { useBoards, useSetBoardArchived } from '@/ui/boards/queries'
import {
  PageCrumbs,
  useArchivesOrigin,
  useBoardsOrigin
} from '@/ui/boards/Crumbs'
import { newlyShared } from '@/ui/boards/seenBoards'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

type Shelf = 'active' | 'archived'

export function useProjectName(): (project: ProjectSummary) => string {
  const { t } = useI18n()
  return project =>
    project.personal ? t('boards.personalProject') : project.name
}

function BoardItem({
  board,
  fresh,
  onUnarchive
}: {
  board: BoardSummary
  fresh: boolean
  onUnarchive?: (() => void) | undefined
}): ReactElement {
  const { t } = useI18n()
  return (
    <BoardCard
      label={board.name}
      badge={(Array.from(board.name)[0] ?? '').toUpperCase()}
      badgeLabel={t(
        board.project.personal
          ? 'boards.personal'
          : board.project.managed
            ? 'boards.space'
            : 'boards.projectBoard'
      )}
      title={
        <Link component={RouterLink} to={`/boards/${board.id}`}>
          {board.name}
        </Link>
      }
      flag={fresh ? t('boards.newlyShared') : undefined}
      chip={
        board.project.personal ? (
          <BoardChip
            label={t('boards.defaultChip')}
            hint={t('boards.defaultHint')}
          />
        ) : board.project.managed ? (
          <BoardChip
            label={t('boards.spaceChip')}
            hint={t('boards.spaceHint', { name: board.project.name })}
          />
        ) : undefined
      }
      meta={
        fresh && board.sharedBy
          ? t('boards.sharedBy', {
              name: board.sharedBy.name ?? board.sharedBy.email
            })
          : board.openTasks === 0
            ? t('boards.noOpenTasks')
            : t('boards.openTasks', { smart_count: board.openTasks })
      }
      members={<BoardMembers board={board} />}
      footerAction={
        onUnarchive && (
          <Button variant="text" size="small" onClick={onUnarchive}>
            {t('archive.unarchive')}
          </Button>
        )
      }
      action={<BoardCardMenu board={board} />}
    />
  )
}

function BoardMembers({ board }: { board: BoardSummary }): ReactElement | null {
  const { t } = useI18n()
  if (board.memberCount === 0) return null
  const label = t('members.count', { smart_count: board.memberCount })
  return (
    <Tooltip title={label}>
      <div role="img" aria-label={label} className="u-flex">
        <PeopleAvatars
          members={board.members}
          total={board.memberCount}
          size={24}
          named={false}
        />
      </div>
    </Tooltip>
  )
}

/** The active boards, or the archived ones, which Archives lists apart. */
export function BoardsScreen({
  shelf = 'active'
}: {
  shelf?: Shelf
}): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const boards = useBoards()
  const [creating, setCreating] = useState(false)
  const unarchive = useSetBoardArchived()
  const [unarchived, setUnarchived] = useState<BoardSummary | null>(null)
  const unarchivedId = useId()
  const boardsOrigin = useBoardsOrigin()
  const archivesOrigin = useArchivesOrigin()
  const archives = shelf === 'archived'
  const origin = archives ? archivesOrigin : boardsOrigin
  useDocumentTitle(origin.label)

  const shown = (boards.data ?? []).filter(board => board.archived === archives)
  const all = listBoards(shown)
  const isNewlyShared = newlyShared()
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('lg'))
  const startCreating = (): void => {
    setCreating(true)
  }

  return (
    <main className="u-ph-2 u-pt-half u-pb-2">
      <PageCrumbs
        origin={origin}
        heading
        actions={
          // The phone bottom bar has no Archives entry.
          phone &&
          !archives && (
            <Button
              component={RouterLink}
              to="/archives"
              variant="text"
              startIcon={<Icon icon={Archive} />}
            >
              {t('boards.archives')}
            </Button>
          )
        }
      />
      {boards.isError && (
        <Typography role="alert">{t('boards.loadFailed')}</Typography>
      )}
      {boards.isPending && <ListSkeleton label={t('app.loading')} rows={3} />}
      {boards.isSuccess &&
        shown.length === 0 &&
        (!archives ? (
          <EmptyState
            icon={Mosaic}
            title={t('boards.empty')}
            text={t('boards.emptyHint')}
            action={
              <Button startIcon={<Icon icon={Plus} />} onClick={startCreating}>
                {t('boards.createFirst')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Archive}
            illustrated
            title={t('boards.emptyArchived')}
            text={t('boards.emptyArchivedHint')}
          />
        ))}
      {archives && shown.length > 0 && (
        <Typography color="textSecondary" className="u-mt-half u-mb-1">
          {t('boards.emptyArchivedHint')}
        </Typography>
      )}
      {all.length > 0 && (
        <CardGrid label={origin.label}>
          {!archives && (
            <CreateCard
              icon={<Icon icon={Plus} size={24} />}
              title={t('boards.createCard')}
              text={t('boards.createHint')}
              onClick={startCreating}
            />
          )}
          {all.map(board => (
            <BoardItem
              key={board.id}
              board={board}
              fresh={isNewlyShared(board)}
              onUnarchive={
                archives && isArchivable(board)
                  ? () => {
                      setUnarchived(null)
                      unarchive.mutate(
                        { boardId: board.id, archived: false },
                        {
                          onSuccess: () => {
                            setUnarchived(board)
                          }
                        }
                      )
                    }
                  : undefined
              }
            />
          ))}
        </CardGrid>
      )}
      {(unarchived ?? unarchive.isError) && (
        <Toast
          open
          autoHideDuration={6000}
          onClose={(_, reason) => {
            if (reason === 'clickaway') return
            setUnarchived(null)
            unarchive.reset()
          }}
        >
          {unarchived ? (
            <Alert
              severity="info"
              role="status"
              aria-labelledby={unarchivedId}
              action={
                <Button
                  variant="text"
                  size="small"
                  onClick={() => {
                    void navigate(`/boards/${unarchived.id}`)
                  }}
                >
                  {t('archive.openTask')}
                </Button>
              }
            >
              <span id={unarchivedId}>
                {t('archive.boardUnarchivedToast', { name: unarchived.name })}
              </span>
            </Alert>
          ) : (
            <Alert severity="error">{t('archive.failed')}</Alert>
          )}
        </Toast>
      )}
      {creating && (
        <NewBoardDialog
          onClose={() => {
            setCreating(false)
          }}
          onCreated={board => {
            void navigate(`/boards/${board.id}`)
          }}
        />
      )}
    </main>
  )
}
