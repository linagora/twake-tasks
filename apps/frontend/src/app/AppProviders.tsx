import { TwakeMuiThemeProvider } from '@linagora/twake-mui'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { ReactElement, ReactNode } from 'react'

import { I18nProvider } from '@/ui/i18n/I18nProvider'
import type { SupportedLanguage } from '@/ui/i18n/languages'

export interface AppProvidersProps {
  lang: SupportedLanguage
  queryClient: QueryClient
  children: ReactNode
}

export function AppProviders({
  lang,
  queryClient,
  children
}: AppProvidersProps): ReactElement {
  return (
    <TwakeMuiThemeProvider>
      <I18nProvider lang={lang}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </I18nProvider>
    </TwakeMuiThemeProvider>
  )
}
