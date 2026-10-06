import { Link, Typography } from '@linagora/twake-mui'
import { useEffect, type ReactElement } from 'react'
import {
  Navigate,
  Outlet,
  Link as RouterLink,
  useLocation,
  useNavigate,
  useParams
} from 'react-router'

import { TileGrid, Tile } from '@/ds/TileGrid'
import { BoardScreen } from '@/ui/boards/BoardScreen'
import { useBoards, useProjects } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

import {
  EMBED_PREFIX,
  isValidEmbedPath,
  isValidResourceId,
  parseEmbedUrl,
  postEmbedPath,
  spaceOrigins,
  suppress
} from '@/ui/embed/spaceHistory'

export function EmbedLayout(): ReactElement {
  const { pathname, search, hash } = useLocation()
  const { projectId = '' } = useParams()
  const navigate = useNavigate()

  // The first URL comes from no history call: it is reported once, as a replace
  useEffect(() => {
    const location = parseEmbedUrl(pathname, search, hash)
    if (location) postEmbedPath(location, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (!spaceOrigins().includes(event.origin)) return
      if (event.source !== window.parent) return
      const { data } = event
      if (typeof data !== 'object' || data === null) return
      const { type, resourceId, path } = data as Record<string, unknown>
      if (type !== 'twake-embed:load' && type !== 'twake-embed:navigate') return
      if (!isValidResourceId(resourceId) || !isValidEmbedPath(path)) return
      if (type === 'twake-embed:navigate' && resourceId !== projectId) return
      void suppress(() =>
        navigate(`${EMBED_PREFIX}${encodeURIComponent(resourceId)}${path}`, {
          replace: true
        })
      )
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
    }
  }, [navigate, projectId])

  return <Outlet />
}

function useProjectBoards(projectId: string) {
  const boards = useBoards()
  const shown = (boards.data ?? []).filter(
    board => board.project.id === projectId && !board.archived
  )
  return { boards, shown }
}

export function EmbedBoardScreen(): ReactElement {
  const { projectId = '', boardId } = useParams()
  const { boards, shown } = useProjectBoards(projectId)
  const only = shown.length === 1 && shown[0]?.id === boardId
  return <BoardScreen back={boards.isSuccess && !only} />
}

export function EmbedProjectScreen(): ReactElement {
  const { t } = useI18n()
  const { projectId = '' } = useParams()
  const projects = useProjects()
  const { boards, shown } = useProjectBoards(projectId)
  const known = projects.data?.some(project => project.id === projectId)
  const failed = boards.isError || projects.isError || known === false
  const only = known && shown.length === 1 ? shown[0] : undefined

  if (only) return <Navigate to={`boards/${only.id}`} replace />

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
