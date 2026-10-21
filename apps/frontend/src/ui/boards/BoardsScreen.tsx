import { Button, IconButton, Link, Tab, Typography } from '@linagora/twake-mui'
import {
  Archive,
  Icon,
  Mosaic,
  Plus,
  Star,
  StarOutline
} from '@linagora/twake-icons'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router'

import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { CardTile, ShelfTabs, Shelves, TileShelf } from '@/ds/TileGrid'
import type { BoardSummary, ProjectSummary } from '@/domain/board'
import { groupBoards } from '@/domain/boardGroups'
import { NewBoardDialog } from '@/ui/boards/NewBoardDialog'
import { useBoards, useSetFavorite } from '@/ui/boards/queries'
import { PageCrumbs, useBoardsOrigin } from '@/ui/boards/Crumbs'
import { newlyShared } from '@/ui/boards/seenBoards'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

type Shelf = 'active' | 'archived'

function FavoriteButton({ board }: { board: BoardSummary }): ReactElement {
  const { t } = useI18n()
  const setFavorite = useSetFavorite()
  const button = useRef<HTMLButtonElement>(null)
  const pressed = useRef(false)

  // The list moves a toggled board, and moving a node drops its focus.
  useEffect(() => {
    if (!pressed.current) return
    pressed.current = false
    button.current?.focus()
  }, [board.favorite])

  return (
    <IconButton
      ref={button}
      size="small"
      color={board.favorite ? 'warning' : 'default'}
      aria-label={t(board.favorite ? 'boards.unstar' : 'boards.star', {
        name: board.name
      })}
      onClick={() => {
        if (setFavorite.isPending) return
        pressed.current = document.activeElement === button.current
        setFavorite.mutate(
          { boardId: board.id, favorite: !board.favorite },
          {
            onError: () => {
              pressed.current = false
            }
          }
        )
      }}
    >
      <Icon icon={board.favorite ? Star : StarOutline} />
    </IconButton>
  )
}

export function useProjectName(): (project: ProjectSummary) => string {
  const { t } = useI18n()
  return project =>
    project.personal ? t('boards.personalProject') : project.name
}

function BoardShelf({
  name,
  boards,
  withProject = false
}: {
  name: string
  boards: BoardSummary[]
  withProject?: boolean
}): ReactElement {
  const { t } = useI18n()
  const projectName = useProjectName()
  const isNewlyShared = newlyShared()
  const status = (board: BoardSummary, fresh: boolean) =>
    fresh && board.sharedBy
      ? t('boards.sharedBy', {
          name: board.sharedBy.name ?? board.sharedBy.email
        })
      : board.openTasks === 0
        ? t('boards.noOpenTasks')
        : t('boards.openTasks', { smart_count: board.openTasks })
  return (
    <TileShelf name={name}>
      {boards.map(board => {
        const fresh = isNewlyShared(board)
        return (
          <CardTile
            key={board.id}
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
            tag={board.keyPrefix}
            meta={
              withProject
                ? `${projectName(board.project)} · ${status(board, fresh)}`
                : status(board, fresh)
            }
            action={<FavoriteButton board={board} />}
          />
        )
      })}
    </TileShelf>
  )
}

export function BoardsScreen(): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const boards = useBoards()
  const [shelf, setShelf] = useState<Shelf>('active')
  const [creating, setCreating] = useState(false)
  const origin = useBoardsOrigin()
  useDocumentTitle(t('boards.title'))

  const shown = (boards.data ?? []).filter(
    board => board.archived === (shelf === 'archived')
  )
  const { starred, projects } = groupBoards(shown)
  const projectName = useProjectName()

  return (
    <main className="u-ph-2 u-pt-half u-pb-2">
      <PageCrumbs
        origin={origin}
        heading
        actions={
          <Button
            startIcon={<Icon icon={Plus} />}
            onClick={() => {
              setCreating(true)
            }}
          >
            {t('boards.new')}
          </Button>
        }
      />
      <ShelfTabs
        segmented
        value={shelf}
        onChange={(_event, value: Shelf) => {
          setShelf(value)
        }}
        className="u-mb-2"
      >
        <Tab value="active" label={t('boards.active')} />
        <Tab value="archived" label={t('boards.archived')} />
      </ShelfTabs>
      {boards.isError && (
        <Typography role="alert">{t('boards.loadFailed')}</Typography>
      )}
      {boards.isPending && <ListSkeleton label={t('app.loading')} rows={3} />}
      {boards.isSuccess &&
        shown.length === 0 &&
        (shelf === 'active' ? (
          <EmptyState
            icon={Mosaic}
            title={t('boards.empty')}
            text={t('boards.emptyHint')}
            action={
              <Button
                startIcon={<Icon icon={Plus} />}
                onClick={() => {
                  setCreating(true)
                }}
              >
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
      <Shelves>
        {starred.length > 0 && (
          <BoardShelf
            name={t('boards.favorites')}
            boards={starred}
            withProject
          />
        )}
        {projects.map(({ project, boards }) => (
          <BoardShelf
            key={project.id}
            name={projectName(project)}
            boards={boards}
          />
        ))}
      </Shelves>
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
