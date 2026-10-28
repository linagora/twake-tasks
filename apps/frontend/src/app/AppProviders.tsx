import {
  overlayThemeOptions,
  SpaceOverlayProvider,
  AlertProvider,
  TwakeMuiThemeProvider,
  type SpaceOverlay
} from '@linagora/twake-mui'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { useMemo, type ReactElement, type ReactNode } from 'react'

import { PickersProvider } from '@/ds/Pickers'
import { accessibleTheme } from '@/ds/theme'
import { I18nProvider } from '@/ui/i18n/I18nProvider'
import type { SupportedLanguage } from '@/ui/i18n/languages'
import { TooManyRequests } from '@/ui/shell/TooManyRequests'

export interface AppProvidersProps {
  lang: SupportedLanguage
  queryClient: QueryClient
  // The overlay of TwakeSpace when the app is framed there: dialogs and side
  // panels go onto its page
  overlay?: SpaceOverlay | null
  children: ReactNode
}

export function AppProviders({
  lang,
  queryClient,
  overlay = null,
  children
}: AppProvidersProps): ReactElement {
  const themeOptions = useMemo(() => {
    if (overlay === null) return accessibleTheme
    const framed = overlayThemeOptions(overlay)
    return {
      ...accessibleTheme,
      components: { ...accessibleTheme.components, ...framed.components }
    }
  }, [overlay])
  return (
    <TwakeMuiThemeProvider themeOptions={themeOptions}>
      <SpaceOverlayProvider overlay={overlay}>
        <I18nProvider lang={lang}>
          <PickersProvider lang={lang}>
            <QueryClientProvider client={queryClient}>
              <AlertProvider>
                <TooManyRequests />
                {children}
              </AlertProvider>
            </QueryClientProvider>
          </PickersProvider>
        </I18nProvider>
      </SpaceOverlayProvider>
    </TwakeMuiThemeProvider>
  )
}
