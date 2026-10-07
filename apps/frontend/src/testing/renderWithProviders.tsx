import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import {
  createBrowserRouter,
  createMemoryRouter,
  RouterProvider
} from 'react-router'

import type { BoardsApi } from '@/application/boards'
import type { SessionService } from '@/application/session'
import { AppProviders } from '@/app/AppProviders'
import { makeQueryClient } from '@/app/queryClient'
import { routes } from '@/app/routes'
import { fakeBoardsApi } from '@/testing/fakeBoardsApi'
import { fakeSession } from '@/testing/fakeSession'
import { BoardsApiProvider } from '@/ui/boards/BoardsApiProvider'
import type { SupportedLanguage } from '@/ui/i18n/languages'
import { SessionGate } from '@/ui/session/SessionGate'

interface Options {
  lang?: SupportedLanguage
  session?: SessionService
  boardsApi?: BoardsApi
}

export function renderWithProviders(
  ui: ReactElement,
  {
    lang = 'en',
    session = fakeSession(),
    boardsApi = fakeBoardsApi()
  }: Options = {}
): RenderResult {
  return render(
    <AppProviders lang={lang} queryClient={makeQueryClient()}>
      <SessionGate session={session}>
        <BoardsApiProvider api={boardsApi}>{ui}</BoardsApiProvider>
      </SessionGate>
    </AppProviders>
  )
}

export function renderRoute(
  path: string,
  options: Options = {}
): RenderResult & { router: ReturnType<typeof createMemoryRouter> } {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return {
    ...renderWithProviders(<RouterProvider router={router} />, options),
    router
  }
}

/** Routes the real browser history: the URL of the page is the route. */
export function renderBrowserRoute(
  options: Options = {}
): RenderResult & { router: ReturnType<typeof createBrowserRouter> } {
  const router = createBrowserRouter(routes)
  return {
    ...renderWithProviders(<RouterProvider router={router} />, options),
    router
  }
}
