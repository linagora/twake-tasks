import {
  overlayThemeOptions,
  SpaceOverlayProvider,
  AlertProvider,
  TwakeMuiThemeProvider,
  type SpaceOverlay
} from '@linagora/twake-mui'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, type ReactElement, type ReactNode } from 'react'

import { useContrast } from '@/ds/contrast'
import { PickersProvider } from '@/ds/Pickers'
import { accessibleTheme, highContrastTheme } from '@/ds/theme'
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
  const { high } = useContrast()
  const themeOptions = useMemo(() => {
    const base = high ? highContrastTheme : accessibleTheme
    if (overlay === null) return base
    const framed = overlayThemeOptions(overlay)
    return { ...base, components: { ...base.components, ...framed.components } }
  }, [overlay, high])
  // The overlay of TwakeSpace gets the app's styles copied, so it is marked too
  useEffect(() => {
    if (!high) return
    // Kept, so that an overlay document left behind is unmarked too
    const marked = new Set<HTMLElement>()
    const mark = (): void => {
      for (const root of [document, overlay?.getBody()?.ownerDocument]) {
        if (!root) continue
        root.documentElement.dataset.contrast = 'high'
        marked.add(root.documentElement)
      }
    }
    mark()
    const unsubscribe = overlay?.subscribe(mark)
    return () => {
      unsubscribe?.()
      for (const root of marked) delete root.dataset.contrast
    }
  }, [overlay, high])
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
