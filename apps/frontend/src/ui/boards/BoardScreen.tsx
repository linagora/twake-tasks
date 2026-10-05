import { Typography } from '@linagora/twake-mui'
import type { ReactElement } from 'react'
import { useParams } from 'react-router'

import { useBoard } from '@/ui/boards/queries'
import { useDocumentTitle } from '@/ui/useDocumentTitle'

export function BoardScreen(): ReactElement {
  const { boardId = '' } = useParams()
  const board = useBoard(boardId)
  useDocumentTitle(board.data?.name ?? null)

  return (
    <main className="u-p-2">
      {board.data && (
        <Typography variant="h3" component="h1">
          {board.data.name}
        </Typography>
      )}
    </main>
  )
}
