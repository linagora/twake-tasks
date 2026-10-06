import { Link, Typography } from '@linagora/twake-mui'
import { useEffect, type ReactElement } from 'react'
import {
  Outlet,
  Link as RouterLink,
  useLocation,
  useParams
} from 'react-router'

import { TileGrid, Tile } from '@/ds/TileGrid'
import { useBoards, useProjects } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

const spaceOrigins = (): string[] =>
  (window.TWAKE_SPACE_ORIGIN ?? '').split(' ').filter(Boolean)

export function EmbedLayout(): ReactElement {
  const { pathname, search } = useLocation()

  useEffect(() => {
    for (const origin of spaceOrigins()) {
      window.parent.postMessage(
        { type: 'twake-tasks:path', path: pathname + search },
        origin
      )
    }
  }, [pathname, search])

  return <Outlet />
}

export function EmbedProjectScreen(): ReactElement {
  const { t } = useI18n()
  const { projectId = '' } = useParams()
  const projects = useProjects()
  const boards = useBoards()
  const known = projects.data?.some(project => project.id === projectId)
  const failed = boards.isError || projects.isError || known === false
  const shown = (boards.data ?? []).filter(
    board => board.project.id === projectId && !board.archived
  )

  return (
    <main className="u-p-2">
      {failed && <Typography role="alert">{t('boards.loadFailed')}</Typography>}
      {boards.isSuccess && known && shown.length === 0 && (
        <Typography>{t('boards.empty')}</Typography>
      )}
      {shown.length > 0 && (
        <TileGrid label={t('boards.title')}>
          {shown.map(board => (
            <Tile key={board.id}>
              <Link
                component={RouterLink}
                to={`boards/${board.id}`}
                underline="none"
                color="textPrimary"
              >
                {board.name}
              </Link>
            </Tile>
          ))}
        </TileGrid>
      )}
    </main>
  )
}
