import type { RouteObject } from 'react-router'

import { BoardScreen } from '@/ui/boards/BoardScreen'
import { BoardsScreen } from '@/ui/boards/BoardsScreen'
import { AppShell } from '@/ui/shell/AppShell'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <BoardsScreen /> },
      { path: '/boards/:boardId', element: <BoardScreen /> }
    ]
  }
]
