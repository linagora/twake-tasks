import {
  Button,
  IconButton,
  Link,
  Tab,
  Tabs,
  Typography
} from '@linagora/twake-mui'
import {
  Archive,
  Icon,
  Mosaic,
  People,
  Plus,
  Star,
  StarOutline,
  Team
} from '@linagora/twake-icons'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router'

import { EmptyState, ListSkeleton } from '@/ds/EmptyState'
import { CardTile, TileGrid } from '@/ds/TileGrid'
import type { BoardSummary } from '@/domain/board'
import { NewBoardDialog } from '@/ui/boards/NewBoardDialog'
import { useBoards, useSetFavorite } from '@/ui/boards/queries'
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

export function BoardsScreen(): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const boards = useBoards()
  const [shelf, setShelf] = useState<Shelf>('active')
  const [creating, setCreating] = useState(false)
  useDocumentTitle(t('boards.title'))

  const shown = (boards.data ?? []).filter(
    board => board.archived === (shelf === 'archived')
  )

  return (
    <main className="u-p-2">
      <div className="u-flex u-flex-items-center u-flex-justify-between u-mb-2">
        <Typography variant="h3" component="h1">
          {t('boards.title')}
        </Typography>
        <Button
          startIcon={<Icon icon={Plus} />}
          onClick={() => {
            setCreating(true)
          }}
        >
          {t('boards.new')}
        </Button>
      </div>
      <Tabs
        segmented
        value={shelf}
        onChange={(_event, value: Shelf) => {
          setShelf(value)
        }}
        className="u-mb-2"
      >
        <Tab value="active" label={t('boards.active')} />
        <Tab value="archived" label={t('boards.archived')} />
      </Tabs>
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
            title={t('boards.emptyArchived')}
            text={t('boards.emptyArchivedHint')}
          />
        ))}
      {shown.length > 0 && (
        <TileGrid label={t('boards.title')}>
          {shown.map(board => (
            <CardTile
              key={board.id}
              label={board.name}
              icon={board.spaceId === null ? People : Team}
              iconLabel={t(
                board.spaceId === null ? 'boards.personal' : 'boards.space'
              )}
              title={
                <Link component={RouterLink} to={`/boards/${board.id}`}>
                  {board.name}
                </Link>
              }
              tag={board.keyPrefix}
              meta={
                board.openTasks === 0
                  ? t('boards.noOpenTasks')
                  : t('boards.openTasks', { smart_count: board.openTasks })
              }
              action={<FavoriteButton board={board} />}
            />
          ))}
        </TileGrid>
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
