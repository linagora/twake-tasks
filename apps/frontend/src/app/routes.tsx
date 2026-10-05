import type { RouteObject } from 'react-router'

import { AgendaScreen, FilterScreen } from '@/ui/agenda/AgendaScreen'
import { FiltersScreen } from '@/ui/agenda/FiltersScreen'
import { SearchScreen } from '@/ui/agenda/SearchScreen'
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
      { path: '/upcoming', element: <AgendaScreen view="upcoming" /> },
      { path: '/mine', element: <AgendaScreen view="mine" /> },
      { path: '/filters', element: <FiltersScreen /> },
      { path: '/filters/:filterId', element: <FilterScreen /> },
      { path: '/search', element: <SearchScreen /> }
    ]
  }
]
