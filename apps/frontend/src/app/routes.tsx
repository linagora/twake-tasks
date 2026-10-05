import type { RouteObject } from 'react-router'

import { BoardScreen } from '@/ui/boards/BoardScreen'
import { BoardsScreen } from '@/ui/boards/BoardsScreen'

export const routes: RouteObject[] = [
  { path: '/', element: <BoardsScreen /> },
  { path: '/boards/:boardId', element: <BoardScreen /> }
]
