import type { RouteObject } from 'react-router'

import { AgendaScreen, FilterScreen } from '@/ui/agenda/AgendaScreen'
import { FiltersScreen } from '@/ui/agenda/FiltersScreen'
import { SearchScreen } from '@/ui/agenda/SearchScreen'
import { BoardScreen } from '@/ui/boards/BoardScreen'
import { BoardsScreen } from '@/ui/boards/BoardsScreen'
import { NotificationsScreen } from '@/ui/boards/Notifications'
import { EmbedLayout, EmbedProjectScreen } from '@/ui/embed/Embed'
import { AppShell } from '@/ui/shell/AppShell'
import { CrashScreen, NotFoundScreen } from '@/ui/shell/Problems'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      {
        errorElement: <CrashScreen />,
        children: [
          { path: '/', element: <BoardsScreen /> },
          { path: '/boards/:boardId', element: <BoardScreen /> },
          { path: '/today', element: <AgendaScreen view="today" /> },
          { path: '/upcoming', element: <AgendaScreen view="upcoming" /> },
          { path: '/mine', element: <AgendaScreen view="mine" /> },
          { path: '/filters', element: <FiltersScreen /> },
          { path: '/filters/:filterId', element: <FilterScreen /> },
          { path: '/search', element: <SearchScreen /> },
          { path: '/notifications', element: <NotificationsScreen /> },
          { path: '*', element: <NotFoundScreen /> }
        ]
      }
    ]
  },
  {
    path: '/embed/projects/:projectId',
    element: <EmbedLayout />,
    children: [
      {
        errorElement: <CrashScreen />,
        children: [
          { index: true, element: <EmbedProjectScreen /> },
          { path: 'boards/:boardId', element: <BoardScreen /> }
        ]
      }
    ]
  }
]
