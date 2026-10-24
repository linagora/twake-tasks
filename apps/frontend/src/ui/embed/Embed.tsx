import { embedRoute, type TwakeSpaceConnection } from '@linagora/twake-embed'
import { Compass } from '@linagora/twake-icons'
import { Link, Typography } from '@linagora/twake-mui'
import { useEffect, type ReactElement } from 'react'
import {
  Navigate,
  Outlet,
  Link as RouterLink,
  useMatch,
  useNavigate,
  useParams
} from 'react-router'

import { EmbedFrame } from '@/ds/AppFrame'
import { EmptyState } from '@/ds/EmptyState'
import { TileGrid, Tile } from '@/ds/TileGrid'
import { BoardScreen } from '@/ui/boards/BoardScreen'
import { useBoards, useProjects } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'
import { NewTaskFromUrl } from '@/ui/shell/NewTaskDialog'
import { NewTaskHighlightProvider } from '@/ui/shell/NewTaskHighlight'

import { useReportBadges } from '@/ui/embed/badges'
import { useReportMetadata } from '@/ui/embed/metadata'
import { EMBED_PREFIX, getTwakeSpace } from '@/ui/embed/twakeSpace'

// The badges stay for the TwakeSpace builds that do not read metadata yet
function SpaceReporter({ space }: { space: TwakeSpaceConnection }): null {
  useReportBadges(space)
  useReportMetadata(space)
  return null
}

export function EmbedLayout(): ReactElement {
  const navigate = useNavigate()
  const space = getTwakeSpace()
  const inBoardId = useMatch('/embed/projects/:projectId/boards/:boardId/*')
    ?.params.boardId

  useEffect(() => {
    const show = (resourceId: string, path: string): Promise<void> =>
      Promise.resolve(
        navigate(embedRoute(EMBED_PREFIX, resourceId) + path, { replace: true })
      )
    return getTwakeSpace()?.syncHistory({ onLoad: show, onNavigate: show })
  }, [navigate])

  return (
    <EmbedFrame>
      {space && <SpaceReporter space={space} />}
      <NewTaskHighlightProvider>
        <Outlet />
        <NewTaskFromUrl inBoardId={inBoardId} />
      </NewTaskHighlightProvider>
    </EmbedFrame>
  )
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
  return (
    <BoardScreen
      back={boards.isSuccess && !only}
      flush
      waiting={boards.isPending && boards.failureCount === 0}
    />
  )
}

export function EmbedNewTask(): ReactElement | null {
  const { projectId = '' } = useParams()
  const { boards, shown } = useProjectBoards(projectId)
  const first = shown[0]
  if (first) return <Navigate to={`../boards/${first.id}?new=task`} replace />
  if (boards.isPending) return null
  return <Navigate to=".." replace />
}

export function EmbedProjectScreen(): ReactElement {
  const { t } = useI18n()
  const { projectId = '' } = useParams()
  const projects = useProjects()
  const { boards, shown } = useProjectBoards(projectId)
  const known = projects.data?.some(project => project.id === projectId)
  const failed = boards.isError || projects.isError
  const only = known && shown.length === 1 ? shown[0] : undefined

  if (only) return <Navigate to={`boards/${only.id}`} replace />

  return (
    <main>
      {known === false && (
        <EmptyState
          icon={Compass}
          title={t('boards.projectNotFound')}
          text={t('problems.notFoundHint')}
        />
      )}
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
