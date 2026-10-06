import { useState, type ReactElement } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'

import type { BoardsApi } from '@/application/boards'
import { noReporting, type Reporting } from '@/application/reporting'
import type { SessionService } from '@/application/session'
import type { SpaceOverlay } from '@linagora/twake-mui'
import { AppProviders } from '@/app/AppProviders'
import { makeQueryClient } from '@/app/queryClient'
import { routes } from '@/app/routes'
import { BoardsApiProvider } from '@/ui/boards/BoardsApiProvider'
import { findPreferredLanguage } from '@/ui/i18n/languages'
import { ReportingProvider } from '@/ui/reporting/ReportingProvider'
import { SessionGate } from '@/ui/session/SessionGate'
import { FollowSettings } from '@/ui/settings/FollowSettings'

export interface AppProps {
  session: SessionService
  boardsApi: BoardsApi
  overlay?: SpaceOverlay | null
  reporting?: Reporting
}

export function App({
  session,
  boardsApi,
  overlay = null,
  reporting = noReporting
}: AppProps): ReactElement {
  const [queryClient] = useState(makeQueryClient)
  const [lang] = useState(findPreferredLanguage)

  return (
    <AppProviders lang={lang} queryClient={queryClient} overlay={overlay}>
      <ReportingProvider reporting={reporting}>
        <SessionGate session={session}>
          <BoardsApiProvider api={boardsApi}>
            <FollowSettings>
              <AppRouter />
            </FollowSettings>
          </BoardsApiProvider>
        </SessionGate>
      </ReportingProvider>
    </AppProviders>
  )
}

// Created once signed in: the sign-in may move the browser off the redirect URI
function AppRouter(): ReactElement {
  const [router] = useState(() => createBrowserRouter(routes))
  return <RouterProvider router={router} />
}
