import { Compass } from '@linagora/twake-icons'
import { Typography } from '@linagora/twake-mui'
import { useEffect, type ReactElement } from 'react'
import { useParams } from 'react-router'

import { ColumnsSkeleton } from '@/ds/Columns'
import { EmptyState } from '@/ds/EmptyState'
import { BoardColumns } from '@/ui/boards/BoardColumns'
import { BoardHeader } from '@/ui/boards/BoardHeader'
import { useBoardName } from '@/ui/boards/BoardsScreen'
import {
  BoardStepsContext,
  OriginContext,
  PageCrumbs,
  useArchivesOrigin,
  useBoardsOrigin
} from '@/ui/boards/Crumbs'
import { useBoardOf, useListedBoard } from '@/ui/queries/boards'
import { markBoardSeen } from '@/ui/boards/seenBoards'
import { useI18n } from '@/ui/i18n/useI18n'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

export function BoardScreen({
  back = true,
  flush = false,
  waiting = false
}: {
  back?: boolean
  flush?: boolean
  waiting?: boolean
}): ReactElement {
  const { t } = useI18n()
  const { boardId = '', projectId } = useParams()
  const { board, shown, missing } = useBoardOf(boardId, projectId)
  // Opened from the boards, its name is known already: the breadcrumb shows it
  // at once rather than "…" then the name.
  const listed = useListedBoard(boardId)
  const boardName = useBoardName()
  const known = shown ?? (missing ? null : listed)
  const name = known ? boardName(known) : '…'
  const boardsOrigin = {
    ...useBoardsOrigin(),
    to: '../..',
    relative: true
  }
  const archivesOrigin = useArchivesOrigin()
  // An archived board is reached from the Archives, as the sidebar shows,
  // except in an embed (flush), which has no Archives page.
  const origin =
    (shown ?? listed)?.archived && !flush ? archivesOrigin : boardsOrigin
  useDocumentTitle(shown ? boardName(shown) : null)
  const shownId = shown?.id
  useEffect(() => {
    if (shownId) markBoardSeen(shownId)
  }, [shownId])

  return (
    <OriginContext value={origin}>
      <BoardStepsContext value={[{ to: '.', label: name, relative: true }]}>
        <main className={flush ? undefined : 'u-ph-2 u-pt-half u-pb-2'}>
          {/* Once loaded, the board titles itself with its breadcrumb. */}
          {back && !(shown && !waiting) && (
            // The size of the board's own title, so that nothing moves once it loads.
            <PageCrumbs origin={origin} current={name} heading={!missing} />
          )}
          {missing && (
            <EmptyState
              heading
              icon={Compass}
              title={t('board.notFound')}
              text={t('problems.notFoundHint')}
            />
          )}
          {board.isError && !missing && (
            <Typography role="alert" className="u-mt-2">
              {t('board.loadFailed')}
            </Typography>
          )}
          {(board.isPending || (waiting && !board.isError && !missing)) && (
            <ColumnsSkeleton label={t('app.loading')} />
          )}
          {shown && !waiting && (
            <>
              <BoardHeader
                board={shown}
                origin={back ? origin : undefined}
                shareButton={!flush}
              />
              <BoardColumns board={shown} settled={!board.isFetching} />
            </>
          )}
        </main>
      </BoardStepsContext>
    </OriginContext>
  )
}
