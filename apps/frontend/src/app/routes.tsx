import type { RouteObject } from 'react-router'

import { AgendaScreen } from '@/ui/agenda/AgendaScreen'
import {
  EditViewScreen,
  FiltersScreen,
  NewViewScreen
} from '@/ui/agenda/FiltersScreen'
import { MyTasksScreen } from '@/ui/agenda/MyTasksScreen'
import { ViewScreen } from '@/ui/agenda/ViewScreen'
import { SearchScreen } from '@/ui/agenda/SearchScreen'
import { ShelfScreen } from '@/ui/boards/Archive'
import { BoardScreen } from '@/ui/boards/BoardScreen'
import { BoardsScreen } from '@/ui/boards/BoardsScreen'
import { NotificationsScreen } from '@/ui/boards/Notifications'
import {
  EmbedBoardScreen,
  EmbedLayout,
  EmbedProjectScreen
} from '@/ui/embed/Embed'
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
          {
            path: '/boards/:boardId/archived',
            element: <ShelfScreen shelf="archived" />
          },
          {
            path: '/boards/:boardId/trash',
            element: <ShelfScreen shelf="trash" />
          },
          { path: '/today', element: <AgendaScreen view="today" /> },
          { path: '/upcoming', element: <AgendaScreen view="upcoming" /> },
          { path: '/mine', element: <MyTasksScreen /> },
          { path: '/filters', element: <FiltersScreen /> },
          { path: '/filters/new', element: <NewViewScreen /> },
          { path: '/filters/:filterId', element: <ViewScreen /> },
          { path: '/filters/:filterId/edit', element: <EditViewScreen /> },
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
          { path: 'boards/:boardId', element: <EmbedBoardScreen /> },
          {
            path: 'boards/:boardId/archived',
            element: <ShelfScreen shelf="archived" flush />
          },
          {
            path: 'boards/:boardId/trash',
            element: <ShelfScreen shelf="trash" flush />
          }
        ]
      }
    ]
  }
]
