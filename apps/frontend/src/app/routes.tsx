import type { RouteObject } from 'react-router'

import { HomeScreen } from '@/ui/home/HomeScreen'

export const routes: RouteObject[] = [{ path: '/', element: <HomeScreen /> }]
