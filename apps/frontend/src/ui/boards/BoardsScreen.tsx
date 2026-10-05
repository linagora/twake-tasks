import { Button, Link, Tab, Tabs, Typography } from '@linagora/twake-mui'
import { useState, type ReactElement } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router'

import { TileGrid, Tile } from '@/ds/TileGrid'
import { NewBoardDialog } from '@/ui/boards/NewBoardDialog'
import { useBoards } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

type Shelf = 'active' | 'archived'

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
      {boards.isSuccess && shown.length === 0 && (
        <Typography>
          {t(shelf === 'active' ? 'boards.empty' : 'boards.emptyArchived')}
        </Typography>
      )}
      {shown.length > 0 && (
        <TileGrid label={t('boards.title')}>
          {shown.map(board => (
            <Tile key={board.id}>
              <Link
                component={RouterLink}
                to={`/boards/${board.id}`}
                underline="none"
                color="textPrimary"
              >
                {board.name}
              </Link>
            </Tile>
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
