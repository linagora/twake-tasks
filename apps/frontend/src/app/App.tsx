import { useState, type ReactElement } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'

import type { BoardsApi } from '@/application/boards'
import type { SessionService } from '@/application/session'
import { AppProviders } from '@/app/AppProviders'
import { makeQueryClient } from '@/app/queryClient'
import { routes } from '@/app/routes'
import { BoardsApiProvider } from '@/ui/boards/BoardsApiProvider'
import { findPreferredLanguage } from '@/ui/i18n/languages'
import { SessionGate } from '@/ui/session/SessionGate'

export interface AppProps {
  session: SessionService
  boardsApi: BoardsApi
}

export function App({ session, boardsApi }: AppProps): ReactElement {
  const [queryClient] = useState(makeQueryClient)
  const [lang] = useState(findPreferredLanguage)

  return (
    <AppProviders lang={lang} queryClient={queryClient}>
      <SessionGate session={session}>
        <BoardsApiProvider api={boardsApi}>
          <AppRouter />
        </BoardsApiProvider>
      </SessionGate>
    </AppProviders>
  )
}

// Created once signed in: the sign-in may move the browser off the redirect URI
function AppRouter(): ReactElement {
  const [router] = useState(() => createBrowserRouter(routes))
  return <RouterProvider router={router} />
}
