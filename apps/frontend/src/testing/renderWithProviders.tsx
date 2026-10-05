import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'

import type { SessionService } from '@/application/session'
import { AppProviders } from '@/app/AppProviders'
import { makeQueryClient } from '@/app/queryClient'
import { fakeSession } from '@/testing/fakeSession'
import type { SupportedLanguage } from '@/ui/i18n/languages'
import { SessionGate } from '@/ui/session/SessionGate'

export function renderWithProviders(
  ui: ReactElement,
  {
    lang = 'en',
    session = fakeSession()
  }: { lang?: SupportedLanguage; session?: SessionService } = {}
): RenderResult {
  return render(
    <AppProviders lang={lang} queryClient={makeQueryClient()}>
      <SessionGate session={session}>{ui}</SessionGate>
    </AppProviders>
  )
}
