import { createContext, use, type ReactElement, type ReactNode } from 'react'

import type { BoardsApi } from '@/application/boards'

const BoardsApiContext = createContext<BoardsApi | null>(null)

export function useBoardsApi(): BoardsApi {
  const api = use(BoardsApiContext)
  if (!api)
    throw new Error('useBoardsApi must be used inside BoardsApiProvider')
  return api
}

export function BoardsApiProvider({
  api,
  children
}: {
  api: BoardsApi
  children: ReactNode
}): ReactElement {
  return <BoardsApiContext value={api}>{children}</BoardsApiContext>
}
