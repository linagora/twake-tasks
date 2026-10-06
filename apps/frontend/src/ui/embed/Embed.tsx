import { Link, Typography, useColorScheme } from '@linagora/twake-mui'
import { useEffect, type ReactElement } from 'react'
import {
  Outlet,
  Link as RouterLink,
  useLocation,
  useParams
} from 'react-router'

import { TileGrid, Tile } from '@/ds/TileGrid'
import { useBoards, useProjectOfSpace } from '@/ui/boards/queries'
import { useI18n } from '@/ui/i18n/useI18n'

const spaceOrigins = (): string[] =>
  (window.TWAKE_SPACE_ORIGIN ?? '').split(' ').filter(Boolean)

function isTheme(data: unknown): data is { theme: 'light' | 'dark' } {
  if (typeof data !== 'object' || data === null) return false
  const { type, theme } = data as Record<string, unknown>
  return type === 'twake-space:theme' && (theme === 'light' || theme === 'dark')
}

export function EmbedLayout(): ReactElement {
  const { pathname, search } = useLocation()
  const { setMode } = useColorScheme()

  useEffect(() => {
    for (const origin of spaceOrigins()) {
      window.parent.postMessage(
        { type: 'twake-tasks:path', path: pathname + search },
        origin
      )
    }
  }, [pathname, search])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!spaceOrigins().includes(event.origin) || !isTheme(event.data)) return
      setMode(event.data.theme)
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
    }
  }, [setMode])

  return <Outlet />
}

export function EmbedSpaceScreen(): ReactElement {
  const { t } = useI18n()
  const { spaceId = '' } = useParams()
  const project = useProjectOfSpace(spaceId)
  const boards = useBoards()
  const shown = (boards.data ?? []).filter(
    board => board.project.id === project.data && !board.archived
  )

  return (
    <main className="u-p-2">
      {(boards.isError || project.isError) && (
        <Typography role="alert">{t('boards.loadFailed')}</Typography>
      )}
      {boards.isSuccess && project.isSuccess && shown.length === 0 && (
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
