import type { RouteObject } from 'react-router'

import { AgendaScreen } from '@/ui/agenda/AgendaScreen'
import { BoardScreen } from '@/ui/boards/BoardScreen'
import { BoardsScreen } from '@/ui/boards/BoardsScreen'
import { AppShell } from '@/ui/shell/AppShell'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <BoardsScreen /> },
      { path: '/boards/:boardId', element: <BoardScreen /> },
      { path: '/today', element: <AgendaScreen view="today" /> },
      { path: '/upcoming', element: <AgendaScreen view="upcoming" /> }
    ]
  }
]
